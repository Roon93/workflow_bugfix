# status

查询当前 workflow 状态

## 输入

无

## 输出

workflow 状态摘要，包括：
- 当前阶段
- 进度
- Loop 轮数

## 实现

调用 workflow.load 读取状态，显示当前阶段、各阶段状态和 Loop 轮数
