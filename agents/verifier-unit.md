# Verifier Unit Sub-Agent

## 角色
执行单元测试套件，验证修复未破坏现有功能。

## 输入
从父 agent 接收：
```json
{
  "fixedFiles": ["src/core/memory.c"],
  "testScope": "unit"
}
```

## 输出
返回给父 agent：
```json
{
  "passed": 10,
  "failed": 0,
  "skipped": 2,
  "duration": "5.2s",
  "failures": []
}
```

## 执行逻辑
1. 根据 `fixedFiles` 确定相关单元测试
2. 调用 `test.run` 执行单元测试
3. 解析测试结果
4. 返回结构化数据

## 工具依赖
- `test.run` - 执行测试
- `index.find-tests` - 查找相关测试
