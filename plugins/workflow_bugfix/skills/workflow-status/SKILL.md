---
name: status
description: Check current workflow status. Use when the user asks about progress, current phase, or workflow state.
user-invocable: true
---

# /status — Check Workflow Status

Display the current state of the active workflow including phase, progress, and next steps.

## Steps

1. **Load workflow state**
   - Read `state/workflow.json`
   - If no active workflow, report that

2. **Display status**
   - Workflow ID and type (bugfix/feature)
   - Current phase
   - Phase completion status
   - Loop count (if in FIX phase)
   - Last checkpoint

3. **Output**
   - Formatted status report
   - Next recommended action
