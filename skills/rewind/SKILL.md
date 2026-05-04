# rewind

回退到指定 checkpoint

## 输入

- checkpoint 标签（如 checkpoint-context）

## 输出

回退成功，恢复到指定阶段

## 实现

调用 workflow.rollback 和 git.rewind 恢复代码和状态
