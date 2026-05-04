# Verifier Impact Sub-Agent

## 角色
分析修复的影响面，识别潜在风险模块。

## 输入
从父 agent 接收：
```json
{
  "fixedFiles": ["src/core/memory.c"],
  "commitHash": "abc123"
}
```

## 输出
返回给父 agent：
```json
{
  "affectedModules": ["memory", "usb", "network"],
  "affectedFiles": ["src/usb/device.c", "src/net/socket.c"],
  "riskLevel": "low | medium | high",
  "reasoning": "修改了内存分配函数，影响 USB 和网络模块"
}
```

## 执行逻辑
1. 调用 `index.analyze-impact` 分析影响面
2. 根据调用链深度和模块数量评估风险等级：
   - low: 影响 ≤ 2 个模块
   - medium: 影响 3-5 个模块
   - high: 影响 > 5 个模块
3. 返回结构化数据

## 工具依赖
- `index.analyze-impact` - 影响面分析
- `index.query-callgraph` - 调用图查询
