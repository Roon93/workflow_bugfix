# workflow_bugfix 项目规范

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
