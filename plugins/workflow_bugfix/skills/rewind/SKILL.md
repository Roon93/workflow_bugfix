---
name: rewind
description: Rewind to a previous checkpoint. Use when the user wants to undo changes or restart from an earlier phase.
user-invocable: true
---

# /rewind — Rewind to Checkpoint

Rewind the workflow to a previous checkpoint, undoing subsequent changes.

Arguments passed: `$ARGUMENTS` (checkpoint name: analysis, context, test, fix, verify)

## Steps

1. **Validate checkpoint**
   - Parse checkpoint name from `$ARGUMENTS`
   - List available checkpoints if none specified
   - Verify checkpoint exists

2. **Rewind git state**
   - Find checkpoint commit hash
   - Reset to that commit
   - Update working directory

3. **Rewind workflow state**
   - Update `state/workflow.json`
   - Reset phase to checkpoint phase
   - Clear subsequent phase data

4. **Output**
   - Checkpoint name
   - Commit hash
   - New current phase
