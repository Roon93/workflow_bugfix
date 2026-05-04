const { StateManager } = require('../../lib/state-manager.js');
const { RepoManager } = require('../../lib/repo-manager.js');

module.exports = async function bugfixStart(args) {
  const bugDescription = args.trim();

  if (!bugDescription) {
    return {
      success: false,
      error: '请提供 Bug 描述'
    };
  }

  const workflowId = `BUG-${Date.now()}`;
  const stateManager = new StateManager();

  stateManager.init(workflowId, 'bugfix');

  const repoManager = new RepoManager();
  const repos = repoManager.list();

  for (const repo of repos) {
    await repoManager.syncBranches(`bugfix/${workflowId}`, [repo]);
  }

  return {
    success: true,
    workflowId,
    phase: 'ANALYSIS',
    message: `Bug 修复工作流已启动 (${workflowId})，请开始分析问题`,
    nextStep: '请描述 Bug 的详细现象、错误信息和复现步骤'
  };
};
