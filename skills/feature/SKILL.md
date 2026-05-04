---
name: feature
description: Start a feature development workflow. Use when the user requests a new feature or enhancement.
user-invocable: true
---

# /feature — Start Feature Development Workflow

Initialize a TDD-based feature development workflow with requirement analysis, test-first implementation, and verification.

Arguments passed: `$ARGUMENTS`

## Steps

1. **Initialize workflow state**
   - Create workflow ID: `FEAT-{timestamp}`
   - Create `state/workflow.json` with phase: ANALYSIS
   - Create git branch: `feature/{workflow-id}`

2. **Collect feature requirements**
   - Feature description from `$ARGUMENTS`
   - Constraints and boundaries
   - Expected behavior

3. **Start analysis phase**
   - Invoke analyzer agent to clarify requirements
   - Identify similar implementations
   - Define change scope

4. **Output**
   - Workflow ID
   - Current phase: ANALYSIS
   - Next steps for the user
