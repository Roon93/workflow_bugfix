const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');

class RepoManager {
  constructor(configPath = '.bugfix/repos.json') {
    this.configPath = configPath;
  }

  list() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`配置文件不存在: ${this.configPath}`);
    }
    const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    return config.repos || [];
  }

  async validateRepos(repos) {
    const results = [];
    for (const repo of repos) {
      const result = { name: repo.name, path: repo.path, valid: false, error: null };
      try {
        if (!fs.existsSync(repo.path)) {
          result.error = '路径不存在';
        } else {
          const git = simpleGit(repo.path);
          await git.checkIsRepo();
          result.valid = true;
        }
      } catch (err) {
        result.error = '不是有效的 git 仓库';
      }
      results.push(result);
    }
    return results;
  }

  async syncBranches(branchName, repos) {
    const results = [];
    for (const repo of repos) {
      const result = { name: repo.name, success: false, error: null };
      try {
        const git = simpleGit(repo.path);
        await git.checkoutLocalBranch(branchName);
        result.success = true;
      } catch (err) {
        result.error = err.message;
      }
      results.push(result);
    }
    return results;
  }

  async syncCommits(message, repos) {
    const results = [];
    for (const repo of repos) {
      const result = { name: repo.name, success: false, error: null };
      try {
        const git = simpleGit(repo.path);
        const status = await git.status();
        if (status.files.length > 0) {
          await git.add('.');
          await git.commit(message);
          result.success = true;
        } else {
          result.error = '无变更需要提交';
        }
      } catch (err) {
        result.error = err.message;
      }
      results.push(result);
    }
    return results;
  }
}

module.exports = RepoManager;
