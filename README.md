# workflow_bugfix

Automated bug fixing and feature development workflow plugin for Claude Code.

## Features

- **TDD-driven bug fixing**: Write failing tests first, then fix
- **Multi-repository support**: Sync branches and commits across repos
- **Non-reproducible bug handling**: Three-level reproduction strategy
- **Code graph analysis**: Blast radius, hub/bridge nodes, impact analysis
- **Incremental indexing**: Fast code navigation with Tree-sitter
- **Checkpoint & rewind**: Git-based state recovery
- **7-phase workflow**: Analysis → Context → Test → Acceptance → Fix → Verify → Output

## Installation

```bash
npm install
chmod +x bin/bugfix-cli
```

## Quick Start

### Bug Fixing

```bash
# Start a bug fix workflow
/bugfix "Memory leak in data_processor.c"

# With log file
/bugfix "Crash on startup" --log crash.log

# Check status
/status

# Resume after interruption
/resume

# Rewind to checkpoint
/rewind checkpoint-context
```

### Feature Development

```bash
# Start a feature workflow
/feature "Add user authentication"

# Check status
/status
```

### Index Management

```bash
# Rebuild code index
/rebuild-index

# Full rebuild
/rebuild-index --full
```

## Configuration

### Multi-repository setup

Create `.bugfix/repos.json`:

```json
{
  "repos": [
    {
      "name": "firmware-core",
      "path": "./",
      "role": "main",
      "language": "c++",
      "buildSystem": "cmake"
    },
    {
      "name": "driver-usb",
      "path": "../driver-usb",
      "role": "dependency",
      "language": "c",
      "buildSystem": "make"
    }
  ]
}
```

### Log patterns

Create `.bugfix/log-patterns.json`:

```json
{
  "timestampPattern": "\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}",
  "levelPatterns": {
    "error": ["ERROR", "ERR", "FATAL"],
    "warn": ["WARN", "WARNING"]
  },
  "errorCodePattern": "error[_\\s]code[:\\s]*(\\d+)"
}
```

## Workflow Phases

1. **ANALYSIS**: Analyze bug/feature, extract clues, generate hypotheses
2. **CONTEXT**: Locate relevant files, symbols, call chains
3. **TEST**: Write failing test (reproduce bug or test feature)
4. **ACCEPTANCE**: Define acceptance criteria
5. **FIX**: Implement fix/feature with TDD loop (max 5 rounds)
6. **VERIFY**: Run regression tests, analyze impact
7. **OUTPUT**: Generate report and result JSON

## Architecture

- **Skills**: User-facing commands (`/bugfix`, `/feature`, etc.)
- **Agents**: Specialized agents (analyzer, locator, tester, fixer, verifier)
- **Tools**: MCP tools (workflow, index, test, git, log)
- **State**: JSON files in `state/` directory
- **Index**: SQLite database in `.bugfix/index.db`

## MCP Tools

### Workflow Management
- `workflow.init` - Initialize workflow
- `workflow.load` - Load current state
- `workflow.advance` - Advance to next phase
- `workflow.rollback` - Rollback to checkpoint

### Code Indexing
- `index.build` - Build code index
- `index.search-files` - Search files by keywords
- `index.search-symbols` - Search symbols by name
- `index.trace-calls` - Trace call chains
- `index.analyze-impact` - Analyze change impact

### Testing
- `test.discover` - Discover test frameworks
- `test.run` - Run tests
- `test.parse-result` - Parse test results

### Git Operations
- `git.create-branch` - Create branch in repos
- `git.commit` - Commit changes
- `git.tag-checkpoint` - Create checkpoint
- `git.rewind` - Rewind to checkpoint

### Log Analysis
- `log.parse` - Parse log file
- `log.extract-clues` - Extract clues from log

## Supported Languages

- C/C++ (gtest, catch2)
- TypeScript/JavaScript (jest, vitest, mocha)
- Python (pytest, unittest)

## State Files

- `state/workflow.json` - Workflow state
- `state/analysis/confirmed.json` - Analysis result
- `state/context/scope.json` - Context scope
- `state/reproduce/test-result.json` - Test result
- `state/acceptance/confirmed.json` - Acceptance criteria
- `state/fix/success.json` - Fix result
- `state/verify/report.json` - Verification report
- `state/output/result.json` - Final output

## Development

```bash
# Run tests
npm test

# Run specific test
npm test -- test/state-manager.test.js

# Build index
node bin/bugfix-cli index:build

# Check workflow
node bin/bugfix-cli workflow:load
```

## License

MIT
