---
name: bugfix
description: Start a bug fixing workflow. Use when the user reports a bug, error, crash, or unexpected behavior.
user-invocable: true
---

# /bugfix — Start Bug Fixing Workflow

Initialize a TDD-based bug fixing workflow with automatic root cause analysis, test reproduction, and verification.

Arguments passed: `$ARGUMENTS`

## Steps

1. **Initialize workflow state**
   - Create workflow ID: `BUG-{timestamp}`
   - Create `state/workflow.json` with phase: ANALYSIS
   - Create git branch: `bugfix/{workflow-id}`

2. **Collect bug information**
   - Bug description from `$ARGUMENTS`
   - Error messages, stack traces, logs
   - Reproduction steps

3. **Start analysis phase**
   - Invoke analyzer agent to classify the bug
   - Identify key clues and candidate root causes
   - Generate reproduction strategy

4. **Output**
   - Workflow ID
   - Current phase: ANALYSIS
   - Next steps for the user
