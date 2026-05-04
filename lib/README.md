# TestRunner

测试框架发现和执行工具。

## 使用示例

```javascript
const TestRunner = require('./test-runner');
const runner = new TestRunner();

// 1. 发现测试框架和测试文件
const discovery = runner.discover(
  ['/path/to/repo1', '/path/to/repo2'],
  ['javascript', 'python', 'cpp']
);
console.log(discovery.frameworks); // { '/path/to/repo1': ['jest', 'pytest'], ... }
console.log(discovery.testFiles);  // { '/path/to/repo1': ['test/a.test.js', ...], ... }

// 2. 运行测试
const result = runner.run('test/example.test.js', 'should work', 'jest', 30000);
console.log(result.status);   // 'passed' or 'failed'
console.log(result.duration); // 执行时间（毫秒）

// 3. 解析测试结果
const parsed = runner.parseResult(result.stdout, result.stderr, 'jest');
console.log(parsed.passed);   // 通过的测试数
console.log(parsed.failed);   // 失败的测试数
console.log(parsed.failures); // 失败详情数组
```

## 支持的框架

- **C/C++**: gtest, catch2
- **TypeScript**: jest, vitest
- **JavaScript**: jest, mocha
- **Python**: pytest, unittest
