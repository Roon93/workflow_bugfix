---
name: resume
description: 从中断点恢复工作流
---

## 输入

无（自动从 state/ 读取）

## 输出

恢复到中断前的阶段

## 实现

调用 workflow.load 加载状态，派发给 bugfix-lead agent 继续执行
