const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const TestRunner = require('../lib/test-runner');

const tmpDir = path.join(__dirname, 'tmp-test-runner');

describe('TestRunner', () => {
  let runner;

  before(() => {
    runner = new TestRunner();
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('discover', () => {
    it('should detect jest framework from package.json', () => {
      const repoDir = path.join(tmpDir, 'jest-repo');
      fs.mkdirSync(repoDir, { recursive: true });
      fs.writeFileSync(
        path.join(repoDir, 'package.json'),
        JSON.stringify({ devDependencies: { jest: '^29.0.0' } })
      );

      const result = runner.discover([repoDir], ['javascript']);
      assert.ok(result.frameworks[repoDir].includes('jest'));
    });

    it('should find test files matching patterns', () => {
      const repoDir = path.join(tmpDir, 'test-files-repo');
      fs.mkdirSync(repoDir, { recursive: true });
      fs.writeFileSync(path.join(repoDir, 'example.test.js'), '');
      fs.writeFileSync(path.join(repoDir, 'sample.spec.js'), '');

      const result = runner.discover([repoDir], ['javascript']);
      assert.strictEqual(result.testFiles[repoDir].length, 2);
    });

    it('should detect pytest from pytest.ini', () => {
      const repoDir = path.join(tmpDir, 'pytest-repo');
      fs.mkdirSync(repoDir, { recursive: true });
      fs.writeFileSync(path.join(repoDir, 'pytest.ini'), '[pytest]');

      const result = runner.discover([repoDir], ['python']);
      assert.ok(result.frameworks[repoDir].includes('pytest'));
    });
  });

  describe('parseResult', () => {
    it('should parse jest output', () => {
      const stdout = `
PASS  test/example.test.js
  ✓ should work (5 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
`;
      const result = runner.parseResult(stdout, '', 'jest');
      assert.strictEqual(result.passed, 1);
      assert.strictEqual(result.failed, 0);
    });

    it('should parse pytest output', () => {
      const stdout = `
============================= test session starts ==============================
collected 3 items

test_example.py ..F                                                      [100%]

=================================== FAILURES ===================================
_________________________________ test_fail ____________________________________
    def test_fail():
>       assert False
E       assert False

test_example.py:10: AssertionError
========================= 2 passed, 1 failed in 0.12s ==========================
`;
      const result = runner.parseResult(stdout, '', 'pytest');
      assert.strictEqual(result.passed, 2);
      assert.strictEqual(result.failed, 1);
      assert.strictEqual(result.failures.length, 1);
      assert.ok(result.failures[0].testName.includes('test_fail'));
    });

    it('should parse gtest output', () => {
      const stdout = `
[==========] Running 2 tests from 1 test suite.
[----------] Global test environment set-up.
[----------] 2 tests from ExampleTest
[ RUN      ] ExampleTest.Pass
[       OK ] ExampleTest.Pass (0 ms)
[ RUN      ] ExampleTest.Fail
test.cpp:10: Failure
Expected equality of these values:
  1
  2
[  FAILED  ] ExampleTest.Fail (1 ms)
[----------] 2 tests from ExampleTest (1 ms total)

[----------] Global test environment tear-down
[==========] 2 tests from 1 test suite ran. (1 ms total)
[  PASSED  ] 1 test.
[  FAILED  ] 1 test, listed below:
[  FAILED  ] ExampleTest.Fail
`;
      const result = runner.parseResult(stdout, '', 'gtest');
      assert.strictEqual(result.passed, 1);
      assert.strictEqual(result.failed, 1);
    });
  });

  describe('_buildCommand', () => {
    it('should build jest command with test name', () => {
      const cmd = runner._buildCommand('test.js', 'should work', 'jest');
      assert.ok(cmd.includes('jest'));
      assert.ok(cmd.includes('test.js'));
      assert.ok(cmd.includes('should work'));
    });

    it('should build pytest command without test name', () => {
      const cmd = runner._buildCommand('test_example.py', null, 'pytest');
      assert.strictEqual(cmd, 'pytest test_example.py');
    });

    it('should build gtest command with filter', () => {
      const cmd = runner._buildCommand('./test_binary', 'ExampleTest.Pass', 'gtest');
      assert.ok(cmd.includes('--gtest_filter=ExampleTest.Pass'));
    });
  });
});
