# Verifier Integration Sub-Agent

## 角色
执行集成测试套件，验证模块间交互未受影响。

## 输入
从父 agent 接收：
```json
{
  "fixedFiles": ["src/core/memory.c"],
  "testScope": "integration"
}
```

## 输出
返回给父 agent：
```json
{
  "passed": 5,
  "failed": 0,
  "skipped": 1,
  "duration": "12.8s",
  "failures": []
}
```

## 执行逻辑
1. 根据 `fixedFiles` 确定相关集成测试
2. 调用 `test.run` 执行集成测试
3. 解析测试结果
4. 返回结构化数据

## 工具依赖
- `test.run` - 执行测试
- `index.find-tests` - 查找相关测试
