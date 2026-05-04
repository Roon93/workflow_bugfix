const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { StateManager } = require('../../lib/state-manager.js');

const TEST_DIR = path.join(__dirname, 'tmp-bugfix-flow-test');
const STATE_DIR = path.join(TEST_DIR, 'state');

function setupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Bugfix Workflow 端到端测试', () => {
  let stateManager;

  before(() => {
    setupTestDir();
    stateManager = new StateManager(STATE_DIR);
  });

  after(() => {
    cleanupTestDir();
  });

  it('完整 bugfix 流程', () => {
    // 1. 初始化 workflow
    const initResult = stateManager.init('bugfix-001', 'bugfix', ['repo1', 'repo2']);
    assert.strictEqual(initResult.success, true);
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'workflow.json')), true);

    let workflow = stateManager.load();
    assert.strictEqual(workflow.currentPhase, 'ANALYSIS');
    assert.strictEqual(workflow.phases.ANALYSIS.status, 'in_progress');

    // 2. 模拟 analyzer 输出
    const analysisOutput = {
      classification: 'logic_error',
      keyClues: ['null pointer', 'missing validation'],
      rootCauseHypothesis: ['input validation missing'],
      reproduceStrategy: 'code_level',
      confidence: 'high',
      repos: ['repo1']
    };
    fs.writeFileSync(
      path.join(STATE_DIR, 'analysis', 'analysis.json'),
      JSON.stringify(analysisOutput, null, 2)
    );

    // 3. 推进到 CONTEXT 阶段
    stateManager.advance('CONTEXT');
    workflow = stateManager.load();
    assert.strictEqual(workflow.currentPhase, 'CONTEXT');
    assert.strictEqual(workflow.phases.ANALYSIS.status, 'completed');

    // 4. 模拟 locator 输出
    const contextOutput = {
      relevantFiles: [
        { repo: 'repo1', path: 'src/validator.js', lines: '10-50', reason: 'validation logic' }
      ],
      relevantSymbols: [
        { name: 'validateInput', type: 'function', file: 'src/validator.js', line: 15 }
      ],
      callChains: ['main -> processData -> validateInput'],
      impactScope: {
        affectedFiles: ['src/validator.js'],
        affectedFunctions: ['validateInput'],
        riskLevel: 'low'
      }
    };
    fs.writeFileSync(
      path.join(STATE_DIR, 'context', 'context.json'),
      JSON.stringify(contextOutput, null, 2)
    );

    // 5. 推进到 TEST 阶段并模拟 tester 输出
    stateManager.advance('TEST');
    const testOutput = {
      status: 'failed',
      testFile: 'test/validator.test.js',
      testName: 'should validate input',
      framework: 'node:test',
      duration: 120,
      result: { passed: 0, failed: 1, skipped: 0 },
      failures: [
        { testName: 'should validate input', reason: 'null pointer exception', file: 'src/validator.js', line: 20 }
      ]
    };
    fs.writeFileSync(
      path.join(STATE_DIR, 'test', 'test-result.json'),
      JSON.stringify(testOutput, null, 2)
    );

    // 6. 推进到 FIX 阶段并模拟 fixer 输出
    stateManager.advance('FIX');
    const fixOutput = {
      fixedFiles: [
        { repo: 'repo1', path: 'src/validator.js', linesChanged: 5, changeType: 'modified' }
      ],
      testPassed: true,
      loopRounds: 1,
      commits: [
        { repo: 'repo1', sha: 'abc123', message: 'fix: add null check in validateInput' }
      ],
      speculativeFix: false
    };
    fs.writeFileSync(
      path.join(STATE_DIR, 'fix', 'fix-result.json'),
      JSON.stringify(fixOutput, null, 2)
    );

    // 7. 推进到 VERIFY 阶段并模拟 verifier 输出
    stateManager.advance('VERIFY');
    const verifyOutput = {
      regressionStatus: 'passed',
      testResults: {
        unitTests: { passed: 10, failed: 0, total: 10 },
        integrationTests: { passed: 5, failed: 0, total: 5 }
      },
      impactAnalysis: {
        affectedFiles: ['src/validator.js'],
        affectedSymbols: ['validateInput'],
        riskLevel: 'low'
      },
      recommendations: ['deploy to staging', 'monitor error rates']
    };
    fs.writeFileSync(
      path.join(STATE_DIR, 'verify', 'verify-report.json'),
      JSON.stringify(verifyOutput, null, 2)
    );

    // 8. 验证最终状态
    workflow = stateManager.load();
    assert.strictEqual(workflow.currentPhase, 'VERIFY');
    assert.strictEqual(workflow.phases.ANALYSIS.status, 'completed');
    assert.strictEqual(workflow.phases.CONTEXT.status, 'completed');
    assert.strictEqual(workflow.phases.TEST.status, 'completed');
    assert.strictEqual(workflow.phases.FIX.status, 'completed');
    assert.strictEqual(workflow.phases.VERIFY.status, 'in_progress');

    // 9. 验证所有输出文件存在
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'analysis', 'analysis.json')), true);
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'context', 'context.json')), true);
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'test', 'test-result.json')), true);
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'fix', 'fix-result.json')), true);
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'verify', 'verify-report.json')), true);

    // 10. 验证输出内容
    const savedAnalysis = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'analysis', 'analysis.json'), 'utf8'));
    assert.strictEqual(savedAnalysis.classification, 'logic_error');
    assert.strictEqual(savedAnalysis.confidence, 'high');

    const savedFix = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'fix', 'fix-result.json'), 'utf8'));
    assert.strictEqual(savedFix.testPassed, true);
    assert.strictEqual(savedFix.loopRounds, 1);

    const savedVerify = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'verify', 'verify-report.json'), 'utf8'));
    assert.strictEqual(savedVerify.regressionStatus, 'passed');
  });
});
