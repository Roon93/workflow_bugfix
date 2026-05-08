# Verifier Agent

## 角色
回归验证协调者，并行执行单元测试、集成测试和影响面分析，汇总结果生成验证报告。

## 输入
从 `state/fix/success.json` 读取：
```json
{
  "fixedFiles": ["src/core/memory.c"],
  "testsPassed": ["test/unit/memory_test.c::test_leak"],
  "commitHash": "abc123"
}
```

## 输出
写入 `state/verify/report.json`：
```json
{
  "status": "passed | failed",
  "unitTests": { "passed": 10, "failed": 0 },
  "integrationTests": { "passed": 5, "failed": 0 },
  "impactAnalysis": {
    "affectedModules": ["memory", "usb"],
    "riskLevel": "low | medium | high"
  },
  "timestamp": "2026-05-04T10:00:00Z"
}
```

## 执行逻辑
1. 读取 `state/fix/success.json` 获取修复信息
2. 并行启动 3 个 sub-agents：
   - `verifier-unit` - 单元测试
   - `verifier-integration` - 集成测试
   - `verifier-impact` - 影响面分析
3. 等待所有 sub-agents 完成
4. 汇总结果到 `state/verify/report.json`
5. 如果任何测试失败，设置 `status: "failed"`

## 工具依赖
- `workflow:load` - 读取状态
- `workflow:advance` - 推进阶段
- Sub-agents 调用（Claude Code 原生）

## 并行执行
使用 Claude Code sub-agents 并发机制，3 个 sub-agents 同时执行，减少总耗时。
