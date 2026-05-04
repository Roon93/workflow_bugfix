const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const RepoManager = require('../lib/repo-manager');

const TEST_DIR = path.join(__dirname, 'tmp-repo-manager-test');
const CONFIG_PATH = path.join(TEST_DIR, '.bugfix', 'repos.json');
const REPO1_PATH = path.join(TEST_DIR, 'repo1');
const REPO2_PATH = path.join(TEST_DIR, 'repo2');

async function setupTestRepos() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(path.join(TEST_DIR, '.bugfix'), { recursive: true });

  fs.mkdirSync(REPO1_PATH, { recursive: true });
  fs.mkdirSync(REPO2_PATH, { recursive: true });

  await simpleGit(REPO1_PATH).init();
  await simpleGit(REPO2_PATH).init();

  fs.writeFileSync(path.join(REPO1_PATH, 'test.txt'), 'test');
  fs.writeFileSync(path.join(REPO2_PATH, 'test.txt'), 'test');

  await simpleGit(REPO1_PATH).add('.').commit('initial commit');
  await simpleGit(REPO2_PATH).add('.').commit('initial commit');

  const config = {
    repos: [
      { name: 'repo1', path: REPO1_PATH, role: 'main' },
      { name: 'repo2', path: REPO2_PATH, role: 'dependency' }
    ]
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function cleanupTestRepos() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('RepoManager', () => {
  before(async () => {
    await setupTestRepos();
  });

  after(() => {
    cleanupTestRepos();
  });

  it('list() 应该返回仓库列表', () => {
    const manager = new RepoManager(CONFIG_PATH);
    const repos = manager.list();
    assert.strictEqual(repos.length, 2);
    assert.strictEqual(repos[0].name, 'repo1');
    assert.strictEqual(repos[1].name, 'repo2');
  });

  it('list() 配置文件不存在时应该抛出错误', () => {
    const manager = new RepoManager('/nonexistent/repos.json');
    assert.throws(() => manager.list(), /配置文件不存在/);
  });

  it('validateRepos() 应该验证有效的仓库', async () => {
    const manager = new RepoManager(CONFIG_PATH);
    const repos = manager.list();
    const results = await manager.validateRepos(repos);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].valid, true);
    assert.strictEqual(results[1].valid, true);
  });

  it('validateRepos() 应该检测无效路径', async () => {
    const manager = new RepoManager(CONFIG_PATH);
    const invalidRepos = [{ name: 'invalid', path: '/nonexistent/path' }];
    const results = await manager.validateRepos(invalidRepos);
    assert.strictEqual(results[0].valid, false);
    assert.strictEqual(results[0].error, '路径不存在');
  });

  it('syncBranches() 应该在所有仓库创建分支', async () => {
    const manager = new RepoManager(CONFIG_PATH);
    const repos = manager.list();
    const results = await manager.syncBranches('test-branch', repos);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].success, true);
    assert.strictEqual(results[1].success, true);

    const branch1 = await simpleGit(REPO1_PATH).branch();
    const branch2 = await simpleGit(REPO2_PATH).branch();
    assert.strictEqual(branch1.current, 'test-branch');
    assert.strictEqual(branch2.current, 'test-branch');
  });

  it('syncCommits() 应该在所有仓库同步提交', async () => {
    const manager = new RepoManager(CONFIG_PATH);
    const repos = manager.list();

    fs.writeFileSync(path.join(REPO1_PATH, 'new.txt'), 'new content');
    fs.writeFileSync(path.join(REPO2_PATH, 'new.txt'), 'new content');

    const results = await manager.syncCommits('test commit', repos);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].success, true);
    assert.strictEqual(results[1].success, true);

    const log1 = await simpleGit(REPO1_PATH).log();
    const log2 = await simpleGit(REPO2_PATH).log();
    assert.strictEqual(log1.latest.message, 'test commit');
    assert.strictEqual(log2.latest.message, 'test commit');
  });

  it('syncCommits() 无变更时应该报告错误', async () => {
    const manager = new RepoManager(CONFIG_PATH);
    const repos = manager.list();
    const results = await manager.syncCommits('empty commit', repos);
    assert.strictEqual(results[0].success, false);
    assert.strictEqual(results[0].error, '无变更需要提交');
  });
});
