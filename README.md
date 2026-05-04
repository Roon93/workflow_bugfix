# workflow_bugfix

Claude Code 自动化 Bug 修复和功能开发工作流插件。

## 功能特性

- **TDD 驱动的 Bug 修复**：先写失败测试，再修复
- **多仓库支持**：跨仓库同步分支和提交
- **不可复现 Bug 处理**：三级复现策略
- **代码图分析**：影响范围、关键节点、影响分析
- **增量索引**：基于 Tree-sitter 的快速代码导航
- **检查点与回退**：基于 Git 的状态恢复
- **7 阶段工作流**：分析 → 上下文 → 测试 → 验收 → 修复 → 验证 → 输出

## 安装

### 1. 安装依赖

```bash
cd /path/to/workflow_bug
npm install
```

**必需依赖：**
- `tree-sitter` - 代码解析
- `tree-sitter-c`, `tree-sitter-cpp`, `tree-sitter-typescript`, `tree-sitter-python` - 语言解析器
- `better-sqlite3` - 代码索引数据库

**系统要求：**
- Node.js >= 20.0.0
- Python 3（用于构建原生模块）
- C++ 编译器（用于 better-sqlite3）

### 2. 作为 Claude Code 插件使用

```bash
claude --plugin-dir /path/to/workflow_bug chat
```

### 3. 作为独立 CLI 使用（可选）

```bash
# 使 CLI 可执行
chmod +x bin/bugfix-cli

# 添加到 PATH 或直接使用
./bin/bugfix-cli workflow:init my-bugfix bugfix
```

## 快速开始

### 作为 Claude Code 插件

```bash
# 启动 bug 修复工作流
/workflow_bug:bugfix

# 启动功能开发工作流
/workflow_bug:feature

# 查看状态
/workflow_bug:status

# 恢复工作流
/workflow_bug:resume

# 回退到检查点
/workflow_bug:rewind

# 重建索引
/workflow_bug:rebuild-index
```

### 作为独立 CLI

```bash
# 初始化工作流
./bin/bugfix-cli workflow:init my-bugfix bugfix

# 构建代码索引
./bin/bugfix-cli index:build

# 搜索文件
./bin/bugfix-cli index:search-files memory leak

# 搜索符号
./bin/bugfix-cli index:search-symbols process_data

# 解析日志文件
./bin/bugfix-cli log:parse crash.log

# 发现测试
./bin/bugfix-cli test:discover

# 创建 git 分支
./bin/bugfix-cli git:create-branch bugfix/memory-leak

# 标记检查点
./bin/bugfix-cli git:tag-checkpoint checkpoint-analysis "分析完成"
```

## 可用技能

作为 Claude Code 插件使用时，可用以下技能：

- **bugfix** - 启动 bug 修复工作流
- **feature** - 启动功能开发工作流
- **status** - 查看工作流状态
- **resume** - 恢复中断的工作流
- **rewind** - 回退到之前的检查点
- **rebuild-index** - 重建代码索引

## CLI 命令

### 工作流管理
- `workflow:init <id> <type>` - 初始化工作流
- `workflow:load` - 加载当前状态
- `workflow:advance <phase>` - 推进到下一阶段
- `workflow:rollback <phase> <tag>` - 回退到检查点

### 代码索引
- `index:build` - 构建代码索引
- `index:search-files <keywords...>` - 按关键词搜索文件
- `index:search-symbols <name>` - 按名称搜索符号
- `index:trace-calls <symbol>` - 追踪调用链
- `index:analyze-impact <files...>` - 分析变更影响

### 测试
- `test:discover` - 发现测试框架
- `test:run <testFile>` - 运行测试

### Git 操作
- `git:create-branch <name>` - 创建分支
- `git:commit <message>` - 提交变更
- `git:tag-checkpoint <tag> <message>` - 创建检查点
- `git:rewind <tag>` - 回退到检查点

### 日志分析
- `log:parse <logFile>` - 解析日志文件
- `log:extract-clues <logFile>` - 从日志提取线索

## 配置

### 多仓库设置

创建 `.bugfix/repos.json`：

```json
{
  "repos": [
    {
      "name": "firmware-core",
      "path": "./",
      "role": "main",
      "language": "c++",
      "buildSystem": "cmake"
    },
    {
      "name": "driver-usb",
      "path": "../driver-usb",
      "role": "dependency",
      "language": "c",
      "buildSystem": "make"
    }
  ]
}
```

### 日志模式

创建 `.bugfix/log-patterns.json`：

```json
{
  "timestampPattern": "\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}",
  "levelPatterns": {
    "error": ["ERROR", "ERR", "FATAL"],
    "warn": ["WARN", "WARNING"]
  },
  "errorCodePattern": "error[_\\s]code[:\\s]*(\\d+)"
}
```

## 工作流阶段

1. **分析（ANALYSIS）**：分析 bug/功能，提取线索，生成假设
2. **上下文（CONTEXT）**：定位相关文件、符号、调用链
3. **测试（TEST）**：编写失败测试（复现 bug 或测试功能）
4. **验收（ACCEPTANCE）**：定义验收标准
5. **修复（FIX）**：实现修复/功能，TDD 循环（最多 5 轮）
6. **验证（VERIFY）**：运行回归测试，分析影响
7. **输出（OUTPUT）**：生成报告和结果 JSON

## 架构

- **技能（Skills）**：面向用户的命令（`/bugfix`、`/feature` 等）
- **代理（Agents）**：专用代理（分析器、定位器、测试器、修复器、验证器）
- **CLI 工具**：独立命令行界面
- **状态（State）**：`state/` 目录中的 JSON 文件
- **索引（Index）**：`.bugfix/index.db` 中的 SQLite 数据库

## 支持的语言

- C/C++（gtest、catch2）
- TypeScript/JavaScript（jest、vitest、mocha）
- Python（pytest、unittest）

## 状态文件

- `state/workflow.json` - 工作流状态
- `state/analysis/confirmed.json` - 分析结果
- `state/context/scope.json` - 上下文范围
- `state/reproduce/test-result.json` - 测试结果
- `state/acceptance/confirmed.json` - 验收标准
- `state/fix/success.json` - 修复结果
- `state/verify/report.json` - 验证报告
- `state/output/result.json` - 最终输出

## 开发

```bash
# 运行测试
npm test

# 运行特定测试
npm test -- test/state-manager.test.js

# 构建索引
./bin/bugfix-cli index:build

# 检查工作流
./bin/bugfix-cli workflow:load
```

## 故障排除

### 安装失败

如果 `npm install` 因原生模块错误失败：

```bash
# 安装构建工具（Ubuntu/Debian）
sudo apt-get install build-essential python3

# 安装构建工具（macOS）
xcode-select --install

# 安装构建工具（Windows）
npm install --global windows-build-tools
```

### 技能未显示

验证插件结构：

```bash
./verify-plugin.sh
```

确保：
- skill 目录名与 `SKILL.md` 中的 `name` 字段匹配
- 所有 `SKILL.md` 文件都有正确的 frontmatter

### CLI 无法执行

```bash
chmod +x bin/bugfix-cli
```

## 许可证

MIT
