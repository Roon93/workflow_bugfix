#!/usr/bin/env bash
# 在 Ubuntu 20.04 环境中重新编译原生模块，打包完整发布包
# 用法: ./build-for-ubuntu20.sh
# 输出: dist/workflow_bug-ubuntu20.tar.gz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="workflow_bug"
OUTPUT_DIR="$SCRIPT_DIR/dist"
OUTPUT_FILE="$OUTPUT_DIR/${PROJECT_NAME}-ubuntu20.tar.gz"
NODE_VERSION="20.11.1"
IMAGE_NAME="workflow-bug-builder"

echo "==> 构建目标: Ubuntu 20.04 + Node.js v${NODE_VERSION}"
echo "==> 项目路径: $SCRIPT_DIR"
echo "==> 输出文件: $OUTPUT_FILE"
echo ""

mkdir -p "$OUTPUT_DIR"

# 写入临时 Dockerfile
DOCKERFILE=$(mktemp)
trap 'rm -f "$DOCKERFILE"' EXIT

cat > "$DOCKERFILE" <<'DOCKERFILE_EOF'
FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    python3 \
    python3-pip \
    make \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

ARG NODE_VERSION=20.11.1
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1

WORKDIR /build
DOCKERFILE_EOF

echo "==> 构建 Docker 镜像 (Ubuntu 20.04 + GCC 9 + Node v${NODE_VERSION})..."
docker build \
    --build-arg NODE_VERSION="$NODE_VERSION" \
    -f "$DOCKERFILE" \
    -t "$IMAGE_NAME" \
    "$SCRIPT_DIR" \
    --quiet

echo "==> 在容器中重新编译原生模块..."
docker run --rm \
    -v "$SCRIPT_DIR:/build:ro" \
    -v "$OUTPUT_DIR:/output" \
    "$IMAGE_NAME" \
    bash -c '
set -euo pipefail

echo "--> 复制项目到工作目录..."
cp -r /build /work
cd /work

echo "--> 验证编译环境..."
gcc --version | head -1
node --version
python3 --version

echo "--> 重新编译 tree-sitter 系列 (从源码构建)..."
for pkg in tree-sitter tree-sitter-c tree-sitter-cpp tree-sitter-python tree-sitter-typescript; do
    echo "    编译 $pkg ..."
    cd /work/node_modules/$pkg
    rm -rf build/
    npx node-gyp rebuild 2>&1 | tail -3
    mkdir -p prebuilds/linux-x64
    cp build/Release/*.node prebuilds/linux-x64/
    echo "    OK: $(ls prebuilds/linux-x64/*.node)"
done

echo "--> 重新编译 better-sqlite3..."
cd /work/node_modules/better-sqlite3
rm -rf build/
npx node-gyp rebuild 2>&1 | tail -3
echo "    OK: $(ls build/Release/*.node)"

echo "--> 验证编译产物 glibc 依赖..."
for f in \
    /work/node_modules/tree-sitter/prebuilds/linux-x64/tree-sitter.node \
    /work/node_modules/tree-sitter-c/prebuilds/linux-x64/tree-sitter-c.node \
    /work/node_modules/better-sqlite3/build/Release/better_sqlite3.node; do
    max_glibc=$(objdump -p "$f" 2>/dev/null | grep "GLIBC_" | grep -v "GLIBCXX\|CXXABI" | grep -oP "GLIBC_\K[\d.]+" | sort -V | tail -1)
    max_glibcxx=$(objdump -p "$f" 2>/dev/null | grep "GLIBCXX_" | grep -oP "GLIBCXX_\K[\d.]+" | sort -V | tail -1)
    echo "    $(basename $f): glibc>=${max_glibc} glibcxx>=${max_glibcxx}"
done

echo "--> 打包完整项目..."
cd /work
# 排除不需要的文件
tar -czf /output/workflow_bug-ubuntu20.tar.gz \
    --exclude=".git" \
    --exclude="dist" \
    --exclude="node_modules/*/build/node_gyp_bins" \
    --exclude="node_modules/.cache" \
    --exclude="*.log" \
    --transform "s|^\.|workflow_bug|" \
    .

echo "--> 打包完成: $(du -sh /output/workflow_bug-ubuntu20.tar.gz | cut -f1)"
'

echo ""
echo "==> 构建成功！"
echo "==> 输出文件: $OUTPUT_FILE"
echo "==> 文件大小: $(du -sh "$OUTPUT_FILE" | cut -f1)"
echo ""
echo "目标机器部署步骤:"
echo "  1. 将 $OUTPUT_FILE 传输到目标机器"
echo "  2. tar -xzf workflow_bug-ubuntu20.tar.gz"
echo "  3. cd workflow_bug && node -e \"require('./lib/index.js')\" # 验证"
