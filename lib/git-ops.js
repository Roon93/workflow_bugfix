const simpleGit = require('simple-git');
const path = require('path');

class GitOps {
  /**
   * 创建分支（多仓库）
   * @param {string} branchName - 分支名称
   * @param {string} baseBranch - 基础分支
   * @param {string[]} repos - 仓库路径列表
   * @returns {Promise<{success: boolean, branches: Array}>}
   */
  async createBranch(branchName, baseBranch, repos) {
    const branches = [];

    for (const repo of repos) {
      const git = simpleGit(repo);
      await git.checkout(baseBranch);
      const baseSha = (await git.revparse(['HEAD'])).trim();
      await git.checkoutLocalBranch(branchName);

      branches.push({
        repo: path.basename(repo),
        branch: branchName,
        baseSha
      });
    }

    return { success: true, branches };
  }

  /**
   * 提交变更（多仓库）
   * @param {string} message - 提交信息
   * @param {string[]} files - 文件列表（可选）
   * @param {string[]} repos - 仓库路径列表
   * @returns {Promise<{success: boolean, commits: Array}>}
   */
  async commit(message, files, repos) {
    const commits = [];

    for (const repo of repos) {
      const git = simpleGit(repo);

      if (files && files.length > 0) {
        await git.add(files);
      } else {
        await git.add('.');
      }

      await git.commit(message);
      const sha = (await git.revparse(['HEAD'])).trim();

      commits.push({
        repo: path.basename(repo),
        sha,
        message,
        files: files || []
      });
    }

    return { success: true, commits };
  }

  /**
   * 创建 checkpoint 标签
   * @param {string} tag - 标签名称
   * @param {string} message - 标签信息
   * @param {string[]} repos - 仓库路径列表
   * @returns {Promise<{success: boolean, tags: Array}>}
   */
  async tagCheckpoint(tag, message, repos) {
    const tags = [];

    for (const repo of repos) {
      const git = simpleGit(repo);
      await git.addTag(tag);
      const sha = (await git.revparse(['HEAD'])).trim();

      tags.push({
        repo: path.basename(repo),
        tag,
        sha
      });
    }

    return { success: true, tags };
  }

  /**
   * 回退到 checkpoint
   * @param {string} checkpointTag - checkpoint 标签
   * @param {string[]} repos - 仓库路径列表
   * @returns {Promise<{success: boolean, rewound: Array}>}
   */
  async rewind(checkpointTag, repos) {
    const rewound = [];

    for (const repo of repos) {
      const git = simpleGit(repo);
      const previousSha = (await git.revparse(['HEAD'])).trim();
      await git.reset(['--hard', checkpointTag]);
      const currentSha = (await git.revparse(['HEAD'])).trim();

      rewound.push({
        repo: path.basename(repo),
        previousSha,
        currentSha
      });
    }

    return { success: true, rewound };
  }
}

module.exports = GitOps;
