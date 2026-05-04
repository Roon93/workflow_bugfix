# 安装指南

## 前置要求

- **Node.js** >= 20.0.0
- **Python 3** (用于编译原生模块)
- **C++ 编译器** (用于编译 better-sqlite3)
  - Ubuntu/Debian: `sudo apt-get install build-essential`
  - macOS: `xcode-select --install`
  - Windows: `npm install --global windows-build-tools`

## 安装步骤

### 1. 克隆仓库

```bash
git clone https://github.com/Roon93/workflow_bugfix.git
cd workflow_bugfix
```

### 2. 安装依赖

```bash
npm install
```

这将安装以下依赖：
- `tree-sitter` - 代码解析引擎
- `tree-sitter-c`, `tree-sitter-cpp`, `tree-sitter-typescript`, `tree-sitter-python` - 语言解析器
- `better-sqlite3` - SQLite 数据库（用于代码索引）

### 3. 验证安装

```bash
./verify-plugin.sh
```

应该看到所有检查项都通过 ✓

## 使用方式

### 方式 1：作为 Claude Code 插件（推荐）

```bash
claude --plugin-dir /path/to/workflow_bugfix chat
```

然后在 Claude Code 中使用：

```bash
/workflow_bugfix:bugfix    # 启动 bug 修复工作流
/workflow_bugfix:feature   # 启动功能开发工作流
/workflow_bugfix:status    # 查看工作流状态
/workflow_bugfix:resume    # 恢复工作流
/workflow_bugfix:rewind    # 回退到检查点
/workflow_bugfix:rebuild-index  # 重建代码索引
```

### 方式 2：作为独立 CLI 工具

```bash
# 使 CLI 可执行
chmod +x bin/bugfix-cli

# 使用 CLI 命令
./bin/bugfix-cli workflow:init my-bugfix bugfix
./bin/bugfix-cli index:build
./bin/bugfix-cli index:search-files memory leak
./bin/bugfix-cli log:parse crash.log
```

完整的 CLI 命令列表见 [README.md](README.md#cli-commands)

## 验证插件加载

```bash
claude --plugin-dir /path/to/workflow_bugfix -p "list available skills"
```

应该看到：
- `workflow_bugfix:bugfix` - 启动 bug 修复工作流
- `workflow_bugfix:feature` - 启动功能开发工作流
- `workflow_bugfix:status` - 查看工作流状态
- `workflow_bugfix:resume` - 恢复工作流
- `workflow_bugfix:rewind` - 回退工作流
- `workflow_bugfix:rebuild-index` - 重建索引

## 目录结构

```
workflow_bugfix/
├── bin/
│   └── bugfix-cli          # 独立 CLI 工具
├── lib/                    # 核心库
├── skills/                 # Claude Code skills
│   ├── bugfix/
│   ├── feature/
│   ├── status/
│   ├── resume/
│   ├── rewind/
│   └── rebuild-index/
├── agents/                 # 专用 agents
├── schemas/                # JSON schemas
├── templates/              # 模板文件
├── package.json            # 依赖配置
└── README.md              # 完整文档
```

## 故障排除

### npm install 失败

**错误**: `gyp ERR! build error` 或 `node-gyp` 相关错误

**解决**:
```bash
# Ubuntu/Debian
sudo apt-get install build-essential python3

# macOS
xcode-select --install

# Windows
npm install --global windows-build-tools
```

### Skills 未显示

**检查**:
1. 运行 `./verify-plugin.sh` 确认结构正确
2. 确认 skill 目录名与 `SKILL.md` 中的 `name` 字段一致
3. 确认使用 `--plugin-dir` 参数指向正确路径

### CLI 命令无法执行

**解决**:
```bash
chmod +x bin/bugfix-cli
```

## 下一步

- 阅读 [README.md](README.md) 了解完整功能
- 查看 [architecture.md](architecture.md) 了解架构设计
- 查看 [使用指南.md](使用指南.md) 了解详细用法
