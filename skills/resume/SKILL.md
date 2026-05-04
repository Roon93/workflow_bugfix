---
name: resume
description: Resume an interrupted workflow. Use when the user wants to continue a paused or interrupted workflow.
user-invocable: true
---

# /resume — Resume Workflow

Resume an interrupted workflow from its last checkpoint.

## Steps

1. **Load workflow state**
   - Read `state/workflow.json`
   - Verify workflow exists and is not completed

2. **Restore context**
   - Load phase-specific state
   - Restore git branch
   - Load last checkpoint

3. **Continue execution**
   - Resume from current phase
   - Invoke appropriate agent

4. **Output**
   - Workflow ID
   - Resumed phase
   - Context summary
