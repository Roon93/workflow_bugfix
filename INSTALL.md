# 安装插件

## 正确的结构

插件目录结构：
```
workflow_bug/
├── .claude-plugin/
│   └── plugin.json        # 插件元数据
└── skills/                # 所有 skills
    ├── bugfix-start/
    │   └── SKILL.md
    ├── feature-start/
    │   └── SKILL.md
    └── ...
```

**重要**：`.claude-plugin/` 目录下只能有 `plugin.json`，不能有 `marketplace.json`

## 安装步骤

### 方法 1：使用 /plugin add（推荐）

```bash
/plugin add /path/to/workflow_bug
```

Claude Code 会自动识别 `.claude-plugin/plugin.json` 并安装插件。

### 方法 2：符号链接

```bash
ln -s /path/to/workflow_bug ~/.claude/plugins/data/workflow_bugfix
```

## 验证安装

```bash
/help
```

应该能看到：
- `/bugfix` - 启动 bug 修复工作流
- `/feature-start` - 启动功能开发工作流
- `/workflow-status` - 查看工作流状态
- `/resume-workflow` - 恢复工作流
- `/rewind` - 回退工作流
- `/rebuild-index` - 重建索引
