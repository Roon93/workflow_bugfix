const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class RepoManager {
  constructor(configPath = '.bugfix/repos.json') {
    this.configPath = configPath;
  }

  list() {
    if (!fs.existsSync(this.configPath)) {
      return [{ name: 'default', path: './', role: 'main', language: 'unknown', buildSystem: 'unknown' }];
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
          execSync('git rev-parse --git-dir', { cwd: repo.path, stdio: 'pipe' });
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
        execSync(`git checkout -b ${branchName}`, { cwd: repo.path, stdio: 'pipe' });
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
        const status = execSync('git status --porcelain', { cwd: repo.path, encoding: 'utf8' });
        if (status.trim()) {
          execSync('git add .', { cwd: repo.path });
          execSync(`git commit -m "${message}"`, { cwd: repo.path });
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

module.exports = { RepoManager };
