const { StateManager } = require('../../lib/state-manager.js');

module.exports = async function workflowStatus(args) {
  const stateManager = new StateManager();

  try {
    const workflow = stateManager.load();

    const phaseStatus = Object.entries(workflow.phases).map(([name, phase]) => ({
      name,
      status: phase.status,
      startedAt: phase.startedAt,
      completedAt: phase.completedAt
    }));

    return {
      success: true,
      workflowId: workflow.id,
      type: workflow.type,
      status: workflow.status,
      currentPhase: workflow.currentPhase,
      phases: phaseStatus,
      loop: workflow.loop
    };
  } catch (error) {
    return {
      success: false,
      error: '未找到活跃的工作流'
    };
  }
};
