# 安装插件

## 问题原因

插件代码已经准备好，但没有被 Claude Code 加载。需要将其注册为本地插件。

## 安装步骤

### 1. 添加本地市场

```bash
/plugin add /path/to/workflow_bug/.claude-plugin/marketplace.json
```

### 2. 安装插件

```bash
/plugin install workflow_bugfix@local-workflow-marketplace
```

### 3. 验证安装

检查插件是否已安装：

```bash
/plugin list
```

应该能看到 `workflow_bugfix@local-workflow-marketplace`

### 4. 测试 skills

```bash
/help
```

应该能看到以下命令：
- `/bugfix` - 启动 bug 修复工作流
- `/feature-start` - 启动功能开发工作流
- `/workflow-status` - 查看工作流状态
- `/resume-workflow` - 恢复工作流
- `/rewind` - 回退工作流
- `/rebuild-index` - 重建索引

## 目录结构

```
workflow_bug/
├── .claude-plugin/
│   └── marketplace.json           # 本地市场配置
└── plugins/
    └── workflow_bugfix/           # 插件实际内容
        ├── .claude-plugin/
        │   └── plugin.json        # 插件元数据
        └── skills/                # 所有 skills
            ├── bugfix-start/
            │   └── SKILL.md
            ├── feature-start/
            │   └── SKILL.md
            ├── workflow-status/
            │   └── SKILL.md
            ├── resume-workflow/
            │   └── SKILL.md
            ├── rewind/
            │   └── SKILL.md
            └── rebuild-index/
                └── SKILL.md
```

## 如果安装失败

1. 检查 marketplace.json 路径是否正确
2. 检查 plugins/workflow_bugfix/.claude-plugin/plugin.json 是否存在
3. 检查每个 skill 的 SKILL.md 格式是否正确（frontmatter 必须有 name, description, user-invocable）
