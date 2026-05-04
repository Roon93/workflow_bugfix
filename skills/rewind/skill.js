const { GitOps } = require('../../lib/git-ops.js');
const { StateManager } = require('../../lib/state-manager.js');

module.exports = async function rewind(args) {
  const checkpointName = args.trim();

  if (!checkpointName) {
    return {
      success: false,
      error: '请指定 checkpoint 名称（如：analysis, context, test）'
    };
  }

  const stateManager = new StateManager();
  const workflow = stateManager.load();
  const gitOps = new GitOps();

  const checkpoints = gitOps.listCheckpoints(workflow.id);
  const checkpoint = checkpoints.find(cp => cp.phase === checkpointName);

  if (!checkpoint) {
    return {
      success: false,
      error: `未找到 checkpoint: ${checkpointName}`,
      available: checkpoints.map(cp => cp.phase)
    };
  }

  gitOps.rewindToCheckpoint(checkpoint.hash);
  stateManager.rewindToPhase(checkpointName.toUpperCase());

  return {
    success: true,
    message: `已回退到 ${checkpointName} 阶段`,
    checkpoint: checkpoint.hash
  };
};
