# 安装插件

## 正确的结构

```
workflow_bug/
└── skills/
    ├── bugfix/SKILL.md
    ├── feature/SKILL.md
    ├── status/SKILL.md
    ├── resume/SKILL.md
    ├── rewind/SKILL.md
    └── rebuild-index/SKILL.md
```

**关键点**：
- 不需要 `.claude-plugin/` 目录
- skill 目录名必须与 `SKILL.md` 中的 `name` 字段一致
- 插件名从仓库目录名推断（如 `workflow_bug`）

## 安装

```bash
claude --plugin-dir /path/to/workflow_bug chat
```

## 验证

```bash
claude --plugin-dir /path/to/workflow_bug -p "list available skills"
```

应该看到：
- `workflow_bug:bugfix` - 启动 bug 修复工作流
- `workflow_bug:feature` - 启动功能开发工作流
- `workflow_bug:status` - 查看工作流状态
- `workflow_bug:resume` - 恢复工作流
- `workflow_bug:rewind` - 回退工作流
- `workflow_bug:rebuild-index` - 重建索引

## 使用

```bash
/workflow_bug:bugfix
/workflow_bug:feature
/workflow_bug:status
```
