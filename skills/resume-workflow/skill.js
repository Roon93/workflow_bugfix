const { StateManager } = require('../../lib/state-manager.js');

module.exports = async function resumeWorkflow(args) {
  const stateManager = new StateManager();

  try {
    const workflow = stateManager.load();

    return {
      success: true,
      workflowId: workflow.id,
      type: workflow.type,
      currentPhase: workflow.currentPhase,
      status: workflow.status,
      message: `恢复工作流 ${workflow.id}，当前阶段：${workflow.currentPhase}`
    };
  } catch (error) {
    return {
      success: false,
      error: '未找到活跃的工作流'
    };
  }
};
