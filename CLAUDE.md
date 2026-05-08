# workflow_bugfix 项目规范

## 快速上手（新会话必读，避免重复探索）

### 核心文件职责

| 文件/目录 | 职责 | 修改时机 |
|-----------|------|----------|
| `lib/index-builder.js` | 代码索引核心，多核并行，SQLite WAL | 索引逻辑变更 |
| `lib/index-config.js` | 索引配置加载，读取 `.bugfix/index-config.json` | 新增配置项 |
| `lib/makefile-parser.js` | 构建系统解析（CMake/Make/Buildroot） | 构建系统支持 |
| `lib/state-manager.js` | workflow 状态机，7 阶段管理 | 阶段逻辑变更 |
| `lib/test-runner.js` | 测试框架发现与执行 | 测试框架支持 |
| `skills/*/SKILL.md` | Claude Code skill 入口定义 | skill 行为变更 |
| `agents/*.md` | 专用 agent 定义（角色/工具/流程） | agent 行为变更 |
| `docs/interfaces.md` | 所有 MCP 工具的输入输出规范 | 接口变更时同步 |
| `docs/architecture.md` | 系统架构、模块关系、数据流 | 架构变更时同步 |

### MCP 工具名规范

工具名一律使用**冒号**分隔，不用点号：
- `index:build` `index:search-files` `index:search-symbols` `index:trace-calls` `index:analyze-impact`
- `workflow:init` `workflow:load` `workflow:advance` `workflow:rollback`
- `git:tag-checkpoint` `git:rewind`
- `log:parse` `log:extract-clues`
- `test:discover` `test:run`

### 关键配置

- 索引配置：`.bugfix/index-config.json`（skipDirs、sourceExts、compileCommandsPaths 等）
- 仓库配置：`.bugfix/repos.json`
- 测试运行：`npm test`（Jest，测试文件在 `test/`）

---

## 开发规范

### 干活前必做

1. **先读相关文档**：涉及接口改动先读 `docs/interfaces.md`，涉及架构先读 `docs/architecture.md`，涉及 agent 行为先读对应的 `agents/*.md`。不要凭记忆直接动手。
2. **文档先行，代码后行**：接口、架构、agent 行为有变更时，先更新对应文档，再改代码。文档是设计决策的载体，代码是实现。

### TDD 开发流程

所有 bugfix 和 feature 开发必须遵循 TDD：

1. 先写失败测试（明确验收条件）
2. 再写最小实现使测试通过
3. 重构（保持测试绿色）

不允许先写实现再补测试。

### 验收标准

每个 bugfix 或 feature 完成前，必须经过：

1. **自测试**：`npm test` 全部通过，无新增失败
2. **Code Review**：检查是否有遗漏的边界条件、安全问题、与现有代码风格不一致的地方
3. **文档同步**：相关文档已更新（interfaces.md、architecture.md、agents/*.md 等）

三项全部完成才能视为验收通过。

### 高上下文任务用 subagent

以下情况必须用 subagent，不要在主会话中直接执行：

- 需要读取 3 个以上文件才能完成的探索性任务
- 全量文档审查（如"检查所有 agent 文件是否一致"）
- 大规模代码搜索（grep 多个目录、分析调用链）
- 独立的测试运行和验证任务

主会话只做决策和最终整合，细节探索交给 subagent。

---

## 项目结构规范

### 文档组织

- **README.md** - 项目简介、快速开始、功能概览
- **docs/** - 所有详细文档
  - `INSTALL.md` - 安装指南
  - `使用指南.md` - 使用说明
  - `architecture.md` - 架构设计
  - `interfaces.md` - 接口文档

### 开发文件管理

以下文件仅用于开发过程，不应提交到 git：
- `prd.md` - 产品需求文档
- `spec.md` - 技术规格
- `task-plan.md` - 任务规划
- `reference-analysis.md` - 参考分析
- `*-SUMMARY.md` - 各类总结文档
- `FIX_*.md` - 修复记录

这些文件已添加到 `.gitignore`

### 目录结构

```
workflow_bugfix/
├── README.md              # 项目简介
├── docs/                  # 文档目录
│   ├── INSTALL.md
│   ├── 使用指南.md
│   ├── architecture.md
│   └── interfaces.md
├── bin/                   # CLI 工具
├── lib/                   # 核心库
├── skills/                # Claude Code skills
├── agents/                # 专用 agents
├── schemas/               # JSON schemas
├── templates/             # 模板文件
├── test/                  # 测试文件
└── package.json
```

## 代码规范

### 提交规范

使用 Conventional Commits 格式：

- `feat:` - 新功能
- `fix:` - Bug 修复
- `docs:` - 文档更新
- `refactor:` - 代码重构
- `test:` - 测试相关
- `chore:` - 构建/工具相关

### 文件命名

- 文档文件：使用中文或英文，保持一致性
- 代码文件：使用 kebab-case（如 `state-manager.js`）
- 配置文件：使用标准命名（如 `package.json`）

## 开发流程

1. 开发过程文档（prd.md、spec.md 等）保存在本地，不提交
2. 完成功能后，将关键信息整理到 `docs/` 目录
3. 更新 README.md 保持简洁，详细内容放在 docs/
4. 提交前检查 `.gitignore` 确保开发文件不被提交
