# 安装插件

## 问题原因

插件代码已经准备好，但没有被 Claude Code 加载。需要将其注册为本地插件。

## 安装步骤

在 Claude Code 中执行以下命令：

```bash
/plugin add /home/roon/code_work/workflow_bug/.claude-plugin/marketplace.json
```

然后安装插件：

```bash
/plugin install workflow_bugfix@local-workflow-marketplace
```

## 验证安装

安装成功后，可以使用以下命令：

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
│   ├── marketplace.json    # 本地市场配置
│   └── plugin.json         # 插件元数据
└── plugins/
    └── workflow_bugfix/    # 插件实际内容
        ├── plugin.json
        └── skills/         # 所有 skills
            ├── bugfix-start/
            ├── feature-start/
            ├── workflow-status/
            ├── resume-workflow/
            ├── rewind/
            └── rebuild-index/
```
