#!/usr/bin/env bash
# Ubuntu 20.04 环境下的真实索引集成测试
# 在主机上克隆 redis（走代理），挂载到 Ubuntu 20.04 容器里跑索引
# 验证多 worker 不崩溃、符号数量合理
#
# 用法:
#   ./test/integration/ubuntu20-index-redis.sh                    # docker 模式（默认）
#   SKIP_DOCKER=1 ./test/integration/ubuntu20-index-redis.sh      # 直接在当前环境跑
#   HTTP_PROXY=http://... ./test/integration/ubuntu20-index-redis.sh  # 指定代理

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
IMAGE_NAME="workflow-bug-builder"
REDIS_TAG="7.2.4"
REDIS_CACHE="${REDIS_CACHE:-/tmp/redis-integration-cache}"
SKIP_DOCKER="${SKIP_DOCKER:-0}"
# 代理：优先用环境变量，其次自动探测 xray
HTTP_PROXY="${HTTP_PROXY:-${http_proxy:-}}"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}[PASS]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }
info() { echo -e "${YELLOW}[INFO]${NC} $*"; }

# ── 1. 在主机上准备 redis 源码（带代理支持）────────────────────────────────────
prepare_redis() {
  if [ -d "$REDIS_CACHE/src" ]; then
    info "redis 已缓存: $REDIS_CACHE"
    return
  fi

  # 自动探测 xray 代理
  if [ -z "$HTTP_PROXY" ]; then
    for port in 10809 7890 1087; do
      if ss -tlnp 2>/dev/null | grep -q "127.0.0.1:${port}"; then
        HTTP_PROXY="http://127.0.0.1:${port}"
        info "自动探测到代理: $HTTP_PROXY"
        break
      fi
    done
  fi

  info "克隆 redis ${REDIS_TAG} 到 $REDIS_CACHE ..."
  local git_proxy_args=()
  if [ -n "$HTTP_PROXY" ]; then
    git_proxy_args=(-c "http.proxy=$HTTP_PROXY")
    info "使用代理: $HTTP_PROXY"
  fi

  git "${git_proxy_args[@]}" clone --depth=1 --branch "${REDIS_TAG}" \
    https://github.com/redis/redis.git "$REDIS_CACHE" 2>&1 | tail -3
}

# ── 2. 索引测试逻辑（在任意 Node 环境中执行）──────────────────────────────────
# 参数: $1=project_dir  $2=redis_dir
run_index_test() {
  local project_dir="$1"
  local redis_dir="$2"

  info "Node.js: $(node --version), CPUs: $(nproc)"

  local c_files
  c_files=$(find "$redis_dir/src" -name "*.c" | wc -l)
  info "redis/src 下 .c 文件数: $c_files"

  local work_dir
  work_dir=$(mktemp -d)
  trap 'rm -rf "$work_dir"' RETURN

  # 生成 compile_commands.json 到 work_dir（redis_dir 可能只读）
  # 路径使用 redis_dir 的实际路径，确保 makefile-parser 能匹配
  info "生成 compile_commands.json..."
  node - "$redis_dir" "$work_dir/compile_commands.json" <<'NODE_EOF'
const fs = require('fs'), path = require('path');
const repoDir = process.argv[2], outPath = process.argv[3];
const srcDir = path.join(repoDir, 'src');
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.c'));
fs.writeFileSync(outPath,
  JSON.stringify(files.map(f => ({
    file: path.join(srcDir, f), directory: srcDir, command: 'cc -c ' + f
  }))));
console.log('compile_commands.json: ' + files.length + ' files');
NODE_EOF

  local db_path="$work_dir/test-index.db"
  local ccdb_path="$work_dir/compile_commands.json"
  info "开始索引（db: $db_path）..."

  node - "$project_dir" "$redis_dir" "$db_path" "$ccdb_path" <<'NODE_EOF'
const projectDir = process.argv[2], repoDir = process.argv[3];
const dbPath = process.argv[4], ccdbPath = process.argv[5];
process.chdir(projectDir);
const { IndexBuilder } = require(projectDir + '/lib/index-builder.js');
const Database = require(projectDir + '/node_modules/better-sqlite3');

async function main() {
  // cfgOverride.compileCommandsPaths 传绝对路径，绕过只读 repoDir 限制
  const builder = new IndexBuilder(dbPath, { compileCommandsPaths: [ccdbPath] });
  let stats;
  try { stats = await builder.indexDirectory(repoDir + '/src', repoDir); }
  finally { builder.close(); }

  const db = new Database(dbPath, { readonly: true });
  const symCount  = db.prepare('SELECT COUNT(*) as n FROM symbols').get().n;
  const callCount = db.prepare('SELECT COUNT(*) as n FROM calls').get().n;
  db.close();

  console.log('stats:   ' + JSON.stringify(stats));
  console.log('symbols: ' + symCount + '  calls: ' + callCount);

  const errors = [];
  if (stats.total   < 100) errors.push('total too low: '   + stats.total   + ' (expected >= 100)');
  if (stats.indexed <  50) errors.push('indexed too low: ' + stats.indexed + ' (expected >= 50)');
  if (symCount      < 500) errors.push('symbols too low: ' + symCount      + ' (expected >= 500)');
  if (callCount     < 200) errors.push('calls too low: '   + callCount     + ' (expected >= 200)');

  if (errors.length > 0) {
    errors.forEach(e => console.error('[FAIL] ' + e));
    process.exit(1);
  }
  console.log('[PASS] 所有验收条件通过');
}
main().catch(err => {
  console.error('[FAIL] exception: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});
NODE_EOF
}

# ── 主流程 ────────────────────────────────────────────────────────────────────
prepare_redis

if [ "$SKIP_DOCKER" = "1" ]; then
  info "跳过 docker，直接在当前环境运行"
  run_index_test "$PROJECT_DIR" "$REDIS_CACHE"
  pass "集成测试通过（当前环境）"
  exit 0
fi

info "检查 docker..."
docker --version || fail "docker 未安装"

if ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
  info "镜像 $IMAGE_NAME 不存在，先构建..."
  "$PROJECT_DIR/build-for-ubuntu20.sh" || fail "镜像构建失败"
fi

# 把测试逻辑写到临时脚本，挂载进容器执行（避免 heredoc 占用 docker stdin）
CONTAINER_SCRIPT=$(mktemp /tmp/redis-integration-XXXXXX.sh)
trap 'rm -f "$CONTAINER_SCRIPT"' EXIT

# 把 run_index_test 函数序列化到容器脚本
cat > "$CONTAINER_SCRIPT" <<CONTAINER_EOF
#!/usr/bin/env bash
set -euo pipefail
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "\${GREEN}[PASS]\${NC} \$*"; }
fail() { echo -e "\${RED}[FAIL]\${NC} \$*"; exit 1; }
info() { echo -e "\${YELLOW}[INFO]\${NC} \$*"; }

# 解压为 Ubuntu 20 编译的发布包（原生模块用 Node 20 编译）
info "解压发布包..."
PLUGIN_DIR=\$(mktemp -d)
tar -xzf /dist/workflow_bug-ubuntu20.tar.gz -C "\$PLUGIN_DIR"
PLUGIN_DIR="\$PLUGIN_DIR/workflow_bug"

# 用主机上最新的 lib/ 覆盖 tarball 里的版本（确保包含最新修复）
cp /plugin/lib/*.js "\$PLUGIN_DIR/lib/"
info "插件目录: \$PLUGIN_DIR"

$(declare -f run_index_test)

run_index_test "\$PLUGIN_DIR" /redis
pass "Ubuntu 20.04 索引测试通过"
CONTAINER_EOF

chmod +x "$CONTAINER_SCRIPT"

info "在 Ubuntu 20.04 容器中运行集成测试..."
docker run --rm \
  -v "$PROJECT_DIR/dist:/dist:ro" \
  -v "$PROJECT_DIR/lib:/plugin/lib:ro" \
  -v "$REDIS_CACHE:/redis:ro" \
  -v "$CONTAINER_SCRIPT:/run-test.sh:ro" \
  "$IMAGE_NAME" \
  bash /run-test.sh

pass "Ubuntu 20.04 集成测试通过"
