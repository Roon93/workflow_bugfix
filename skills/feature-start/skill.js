const { StateManager } = require('../../lib/state-manager.js');
const { RepoManager } = require('../../lib/repo-manager.js');

module.exports = async function featureStart(args) {
  const featureDescription = args.trim();

  if (!featureDescription) {
    return {
      success: false,
      error: '请提供功能描述'
    };
  }

  const workflowId = `FEAT-${Date.now()}`;
  const stateManager = new StateManager();

  stateManager.init(workflowId, 'feature');

  const repoManager = new RepoManager();
  const repos = repoManager.list();

  for (const repo of repos) {
    await repoManager.syncBranches(`feature/${workflowId}`, [repo]);
  }

  return {
    success: true,
    workflowId,
    phase: 'ANALYSIS',
    message: `功能开发工作流已启动 (${workflowId})`,
    nextStep: '请详细描述功能需求和约束条件'
  };
};
