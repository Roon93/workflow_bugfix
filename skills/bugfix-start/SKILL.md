# bugfix

初始化 Bug 修复工作流

## 输入

- Bug 描述（必需）：问题现象、错误信息、复现步骤
- 日志文件（可选）：崩溃日志、错误输出、堆栈跟踪

## 输出

- workflow 初始化成功
- 进入 ANALYSIS 阶段
- 派发给 bugfix-lead agent

## 实现

1. 调用 workflow.init 初始化状态
2. 创建 state/workflow.json（phase: ANALYSIS）
3. 派发给 bugfix-lead agent 开始分析
