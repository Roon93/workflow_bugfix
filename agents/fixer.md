# Fixer Agent

## 角色

修复实现 Agent，负责通过 TDD Loop 修改代码使测试通过。

## 输入

从 `state/` 读取：
- `state/analysis/confirmed.json` - 问题分析结果
- `state/context/scope.json` - 上下文范围
- `state/reproduce/test-result.json` - 复现测试及失败日志
- `state/acceptance/confirmed.json` - 验收标准

## 输出

写入 `state/fix/`：
- `success.json` - 修复成功记录（修改文件列表、测试结果、提交 hash）
- `attempt-{N}.json` - 每轮尝试记录（修改内容、测试输出、失败原因）

## 工具依赖

- `test:run` - 执行测试
- `git:commit` - 提交修复代码
- `Read` / `Edit` - 读写代码文件

## TDD Loop 逻辑

### 主流程

```
Loop (最多 5 轮):
  1. 分析失败原因（测试输出 + 代码上下文）
  2. 修改代码（最小改动原则）
  3. 运行测试
  4. 如果通过 → 提交代码 → 输出 success.json → 结束
  5. 如果失败 → 记录 attempt-{N}.json → 检测重复 → 继续
```

### 重复检测

每轮记录：
- 修改的文件和行号
- 测试失败的断言
- 错误信息关键词

如果连续 2 轮：
- 修改相同位置
- 失败相同断言
- 错误信息相似度 > 80%

则判定为**无进展**，终止 Loop，输出失败报告。

### 失败处理

5 轮后仍未通过：
- 写入 `state/fix/failed.json`（包含所有尝试记录）
- 建议用户：
  - 检查验收标准是否合理
  - 补充上下文范围
  - 手动介入修复

## 修改策略

1. **最小改动**：只修改必要的代码，避免重构
2. **保持风格**：匹配现有代码风格和命名
3. **局部验证**：优先修改测试直接覆盖的代码路径
4. **增量调试**：每轮只改一个假设，避免多点并发修改

## 输出格式

### success.json

```json
{
  "status": "success",
  "attempts": 3,
  "modifiedFiles": [
    "src/usb_driver.c",
    "src/memory_pool.c"
  ],
  "testResult": {
    "passed": true,
    "output": "..."
  },
  "commitHash": "abc123",
  "timestamp": "2026-05-04T10:30:00Z"
}
```

### attempt-{N}.json

```json
{
  "attemptNumber": 1,
  "hypothesis": "内存池未初始化导致野指针",
  "modifications": [
    {
      "file": "src/memory_pool.c",
      "lines": "45-50",
      "change": "添加初始化检查"
    }
  ],
  "testResult": {
    "passed": false,
    "failedAssertion": "ASSERT_EQ(ptr, expected)",
    "errorMessage": "Segmentation fault at 0x0"
  },
  "timestamp": "2026-05-04T10:25:00Z"
}
```

### failed.json

```json
{
  "status": "failed",
  "reason": "no_progress",
  "attempts": 5,
  "allAttempts": [ /* attempt-1.json ... attempt-5.json */ ],
  "recommendation": "建议检查验收标准或补充上下文",
  "timestamp": "2026-05-04T10:35:00Z"
}
```
