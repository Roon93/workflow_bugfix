const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const GitOps = require('../lib/git-ops');

const TEST_DIR = path.join(__dirname, '.test-repos');

describe('GitOps', () => {
  let gitOps;
  let testRepos;

  beforeEach(() => {
    gitOps = new GitOps();

    // 创建测试仓库
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });

    testRepos = ['repo1', 'repo2'].map(name => {
      const repoPath = path.join(TEST_DIR, name);
      fs.mkdirSync(repoPath);
      execSync('git init', { cwd: repoPath });
      execSync('git config user.email "test@test.com"', { cwd: repoPath });
      execSync('git config user.name "Test User"', { cwd: repoPath });
      fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test');
      execSync('git add .', { cwd: repoPath });
      execSync('git commit -m "Initial commit"', { cwd: repoPath });
      return repoPath;
    });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('createBranch - 创建分支', async () => {
    const result = await gitOps.createBranch('feature/test', 'master', testRepos);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.branches.length, 2);
    assert.strictEqual(result.branches[0].branch, 'feature/test');
    assert.ok(result.branches[0].baseSha);
  });

  it('commit - 提交变更', async () => {
    await gitOps.createBranch('feature/test', 'master', testRepos);

    testRepos.forEach(repo => {
      fs.writeFileSync(path.join(repo, 'test.txt'), 'test content');
    });

    const result = await gitOps.commit('test: add test file', ['test.txt'], testRepos);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.commits.length, 2);
    assert.strictEqual(result.commits[0].message, 'test: add test file');
    assert.ok(result.commits[0].sha);
  });

  it('tagCheckpoint - 创建标签', async () => {
    const result = await gitOps.tagCheckpoint('checkpoint-test', 'Test checkpoint', testRepos);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.tags.length, 2);
    assert.strictEqual(result.tags[0].tag, 'checkpoint-test');
    assert.ok(result.tags[0].sha);
  });

  it('rewind - 回退到 checkpoint', async () => {
    await gitOps.tagCheckpoint('checkpoint-1', 'First checkpoint', testRepos);

    testRepos.forEach(repo => {
      fs.writeFileSync(path.join(repo, 'new.txt'), 'new content');
      execSync('git add . && git commit -m "Add new file"', { cwd: repo });
    });

    const result = await gitOps.rewind('checkpoint-1', testRepos);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.rewound.length, 2);
    assert.ok(result.rewound[0].previousSha);
    assert.ok(result.rewound[0].currentSha);
    assert.notStrictEqual(result.rewound[0].previousSha, result.rewound[0].currentSha);

    testRepos.forEach(repo => {
      assert.strictEqual(fs.existsSync(path.join(repo, 'new.txt')), false);
    });
  });
});
