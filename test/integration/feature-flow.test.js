const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { StateManager } = require('../../lib/state-manager');

const TEST_DIR = path.join(__dirname, 'tmp-feature-flow-test');
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

describe('Feature Workflow 端到端测试', () => {
  let stateManager;

  before(() => {
    setupTestDir();
    stateManager = new StateManager(STATE_DIR);
  });

  after(() => {
    cleanupTestDir();
  });

  it('完整 feature 流程', () => {
    // 1. 初始化 feature workflow
    const initResult = stateManager.init('feature-001', 'feature', ['repo1']);
    assert.strictEqual(initResult.success, true);
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'workflow.json')), true);

    let workflow = stateManager.load();
    assert.strictEqual(workflow.type, 'feature');
    assert.strictEqual(workflow.currentPhase, 'ANALYSIS');

    // 2. 模拟需求分析输出
    const analysisOutput = {
      requirements: ['需求1', '需求2'],
      acceptanceCriteria: ['验收1', '验收2']
    };
    fs.writeFileSync(
      path.join(STATE_DIR, 'analysis', 'requirements.json'),
      JSON.stringify(analysisOutput, null, 2)
    );

    stateManager.advance('CONTEXT');
    workflow = stateManager.load();
    assert.strictEqual(workflow.currentPhase, 'CONTEXT');
    assert.strictEqual(workflow.phases.ANALYSIS.status, 'completed');

    // 3. 模拟上下文检索输出
    const contextOutput = {
      relevantFiles: ['src/main.js', 'src/utils.js'],
      dependencies: ['express']
    };
    fs.writeFileSync(
      path.join(STATE_DIR, 'context', 'context.json'),
      JSON.stringify(contextOutput, null, 2)
    );

    stateManager.advance('TEST');
    workflow = stateManager.load();
    assert.strictEqual(workflow.currentPhase, 'TEST');
    assert.strictEqual(workflow.phases.CONTEXT.status, 'completed');

    // 4. 模拟测试编写输出
    const testOutput = {
      testFiles: ['test/feature.test.js'],
      testCount: 5
    };
    fs.writeFileSync(
      path.join(STATE_DIR, 'test', 'tests.json'),
      JSON.stringify(testOutput, null, 2)
    );

    stateManager.advance('ACCEPTANCE');
    workflow = stateManager.load();
    assert.strictEqual(workflow.currentPhase, 'ACCEPTANCE');
    assert.strictEqual(workflow.phases.TEST.status, 'completed');

    // 5. 模拟实现输出（跳过 ACCEPTANCE，直接到 FIX 阶段用于实现）
    stateManager.updatePhaseStatus('ACCEPTANCE', 'completed');
    stateManager.advance('FIX');

    const implOutput = {
      modifiedFiles: ['src/main.js', 'src/utils.js'],
      linesChanged: 120
    };
    fs.writeFileSync(
      path.join(STATE_DIR, 'impl', 'implementation.json'),
      JSON.stringify(implOutput, null, 2)
    );

    workflow = stateManager.load();
    assert.strictEqual(workflow.currentPhase, 'FIX');

    // 6. 模拟验证输出
    stateManager.advance('VERIFY');
    const verifyOutput = {
      testsPassed: true,
      coverage: 85,
      issues: []
    };
    fs.writeFileSync(
      path.join(STATE_DIR, 'verify', 'verify-report.json'),
      JSON.stringify(verifyOutput, null, 2)
    );

    workflow = stateManager.load();
    assert.strictEqual(workflow.currentPhase, 'VERIFY');
    assert.strictEqual(workflow.phases.FIX.status, 'completed');

    // 7. 验证最终输出
    stateManager.advance('OUTPUT');
    workflow = stateManager.load();
    assert.strictEqual(workflow.currentPhase, 'OUTPUT');
    assert.strictEqual(workflow.phases.VERIFY.status, 'completed');

    // 验证所有阶段文件存在
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'analysis', 'requirements.json')), true);
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'context', 'context.json')), true);
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'test', 'tests.json')), true);
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'impl', 'implementation.json')), true);
    assert.strictEqual(fs.existsSync(path.join(STATE_DIR, 'verify', 'verify-report.json')), true);

    // 验证最终状态
    const finalWorkflow = stateManager.load();
    assert.strictEqual(finalWorkflow.type, 'feature');
    assert.strictEqual(finalWorkflow.currentPhase, 'OUTPUT');
    assert.strictEqual(finalWorkflow.phases.ANALYSIS.status, 'completed');
    assert.strictEqual(finalWorkflow.phases.CONTEXT.status, 'completed');
    assert.strictEqual(finalWorkflow.phases.TEST.status, 'completed');
    assert.strictEqual(finalWorkflow.phases.VERIFY.status, 'completed');
  });
});
