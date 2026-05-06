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

## 快速开始

### 联网环境安装

```bash
git clone https://github.com/Roon93/workflow_bugfix.git
cd workflow_bugfix
npm install
```

### 离线/内网环境安装

依赖已打包在仓库中，无需联网安装：

```bash
git clone <仓库地址>
cd workflow_bugfix
npm rebuild    # 重新编译 better-sqlite3 匹配目标 Node ABI
```

详细安装说明见 [docs/INSTALL.md](docs/INSTALL.md)

### 作为 Claude Code 插件使用

```bash
claude --plugin-dir /path/to/workflow_bugfix chat
```

然后使用技能：

```bash
/workflow_bugfix:bugfix    # 启动 bug 修复工作流
/workflow_bugfix:feature   # 启动功能开发工作流
/workflow_bugfix:status    # 查看工作流状态
```

### 作为独立 CLI 使用

```bash
chmod +x bin/bugfix-cli
./bin/bugfix-cli index:build
./bin/bugfix-cli workflow:init my-bugfix bugfix
```

## 可用技能

- **bugfix** - 启动 bug 修复工作流
- **feature** - 启动功能开发工作流
- **status** - 查看工作流状态
- **resume** - 恢复中断的工作流
- **rewind** - 回退到之前的检查点
- **rebuild-index** - 重建代码索引

## 文档

- [安装指南](docs/INSTALL.md) - 详细安装步骤和依赖说明
- [使用指南](docs/使用指南.md) - 完整使用说明和示例
- [架构设计](docs/architecture.md) - 系统架构和设计文档
- [接口文档](docs/interfaces.md) - API 和接口说明

## 支持的语言

- C/C++（gtest、catch2）
- TypeScript/JavaScript（jest、vitest、mocha）
- Python（pytest、unittest）

## 许可证

MIT
