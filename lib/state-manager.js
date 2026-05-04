const fs = require('fs');
const path = require('path');

class StateManager {
  constructor(stateDir = './state') {
    this.stateDir = stateDir;
    this.workflowFile = path.join(stateDir, 'workflow.json');
  }

  init(workflowId, type, repos = []) {
    if (fs.existsSync(this.workflowFile)) {
      throw new Error('Workflow already exists. Use resume() instead.');
    }

    fs.mkdirSync(this.stateDir, { recursive: true });
    fs.mkdirSync(path.join(this.stateDir, 'analysis'), { recursive: true });
    fs.mkdirSync(path.join(this.stateDir, 'context'), { recursive: true });
    fs.mkdirSync(path.join(this.stateDir, 'reproduce'), { recursive: true });
    fs.mkdirSync(path.join(this.stateDir, 'test'), { recursive: true });
    fs.mkdirSync(path.join(this.stateDir, 'acceptance'), { recursive: true });
    fs.mkdirSync(path.join(this.stateDir, 'fix'), { recursive: true });
    fs.mkdirSync(path.join(this.stateDir, 'impl'), { recursive: true });
    fs.mkdirSync(path.join(this.stateDir, 'verify'), { recursive: true });
    fs.mkdirSync(path.join(this.stateDir, 'checkpoints'), { recursive: true });

    const now = new Date().toISOString();
    const workflow = {
      id: workflowId,
      type,
      status: 'in_progress',
      currentPhase: 'ANALYSIS',
      createdAt: now,
      updatedAt: now,
      phases: {
        ANALYSIS: { status: 'in_progress', startedAt: now },
        CONTEXT: { status: 'pending' },
        TEST: { status: 'pending' },
        ACCEPTANCE: { status: 'pending' },
        FIX: { status: 'pending' },
        VERIFY: { status: 'pending' },
        OUTPUT: { status: 'pending' }
      },
      loop: { currentRound: 0, maxRounds: 5, history: [] },
      repos,
      speculativeFix: false
    };

    fs.writeFileSync(this.workflowFile, JSON.stringify(workflow, null, 2));
    return { success: true, workflowFile: this.workflowFile, stateDir: this.stateDir };
  }

  load() {
    if (!fs.existsSync(this.workflowFile)) {
      throw new Error('No workflow found. Use init() first.');
    }
    return JSON.parse(fs.readFileSync(this.workflowFile, 'utf8'));
  }

  advance(phase, checkpoint = true) {
    const workflow = this.load();
    const previousPhase = workflow.currentPhase;

    workflow.phases[previousPhase].status = 'completed';
    workflow.phases[previousPhase].completedAt = new Date().toISOString();

    if (checkpoint) {
      workflow.phases[previousPhase].checkpoint = `checkpoint-${previousPhase.toLowerCase()}`;
    }

    workflow.currentPhase = phase;
    workflow.phases[phase].status = 'in_progress';
    workflow.phases[phase].startedAt = new Date().toISOString();
    workflow.updatedAt = new Date().toISOString();

    fs.writeFileSync(this.workflowFile, JSON.stringify(workflow, null, 2));

    return {
      success: true,
      previousPhase,
      currentPhase: phase,
      checkpointTag: checkpoint ? `checkpoint-${previousPhase.toLowerCase()}` : null
    };
  }

  rollback(phase, checkpointTag) {
    const workflow = this.load();

    workflow.currentPhase = phase;
    workflow.phases[phase].status = 'in_progress';
    workflow.updatedAt = new Date().toISOString();

    const phasesToReset = Object.keys(workflow.phases).filter(p => {
      const phaseOrder = ['ANALYSIS', 'CONTEXT', 'TEST', 'ACCEPTANCE', 'FIX', 'VERIFY', 'OUTPUT'];
      return phaseOrder.indexOf(p) > phaseOrder.indexOf(phase);
    });

    phasesToReset.forEach(p => {
      workflow.phases[p].status = 'pending';
      delete workflow.phases[p].startedAt;
      delete workflow.phases[p].completedAt;
    });

    fs.writeFileSync(this.workflowFile, JSON.stringify(workflow, null, 2));

    return {
      success: true,
      rolledBackTo: phase,
      restoredFiles: [this.workflowFile]
    };
  }

  updatePhaseStatus(phase, status) {
    const workflow = this.load();
    workflow.phases[phase].status = status;
    workflow.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.workflowFile, JSON.stringify(workflow, null, 2));
    return { success: true };
  }

  incrementLoop() {
    const workflow = this.load();
    workflow.loop.currentRound++;
    workflow.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.workflowFile, JSON.stringify(workflow, null, 2));
    return workflow.loop.currentRound;
  }

  addLoopHistory(entry) {
    const workflow = this.load();
    workflow.loop.history.push({ ...entry, timestamp: new Date().toISOString() });
    fs.writeFileSync(this.workflowFile, JSON.stringify(workflow, null, 2));
  }

  markSpeculative() {
    const workflow = this.load();
    workflow.speculativeFix = true;
    fs.writeFileSync(this.workflowFile, JSON.stringify(workflow, null, 2));
  }
}

module.exports = { StateManager };
