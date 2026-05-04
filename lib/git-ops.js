const { execSync } = require('child_process');
const path = require('path');

class GitOps {
  exec(cmd, cwd = '.') {
    try {
      return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      throw new Error(`Git command failed: ${error.message}`);
    }
  }

  async createBranch(branchName, baseBranch, repos) {
    const branches = [];
    for (const repo of repos) {
      this.exec(`git checkout ${baseBranch}`, repo);
      const baseSha = this.exec('git rev-parse HEAD', repo).trim();
      this.exec(`git checkout -b ${branchName}`, repo);
      branches.push({ repo: path.basename(repo), branch: branchName, baseSha });
    }
    return { success: true, branches };
  }

  async commit(message, files, repos) {
    const commits = [];
    for (const repo of repos) {
      if (files && files.length > 0) {
        this.exec(`git add ${files.join(' ')}`, repo);
      } else {
        this.exec('git add .', repo);
      }
      this.exec(`git commit -m "${message}"`, repo);
      const sha = this.exec('git rev-parse HEAD', repo).trim();
      commits.push({ repo: path.basename(repo), sha, message });
    }
    return { success: true, commits };
  }

  async tagCheckpoint(tag, message, repos) {
    const tags = [];
    for (const repo of repos) {
      this.exec(`git tag -a ${tag} -m "${message}"`, repo);
      tags.push({ repo: path.basename(repo), tag });
    }
    return { success: true, tags };
  }

  async rewind(checkpointTag, repos) {
    const results = [];
    for (const repo of repos) {
      this.exec(`git reset --hard ${checkpointTag}`, repo);
      results.push({ repo: path.basename(repo), tag: checkpointTag });
    }
    return { success: true, results };
  }
}

module.exports = { GitOps };
