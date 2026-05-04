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

### 1. Install Dependencies

```bash
cd /path/to/workflow_bug
npm install
```

**Required dependencies:**
- `tree-sitter` - Code parsing
- `tree-sitter-c`, `tree-sitter-cpp`, `tree-sitter-typescript`, `tree-sitter-python` - Language parsers
- `better-sqlite3` - Code index database

**System requirements:**
- Node.js >= 20.0.0
- Python 3 (for building native modules)
- C++ compiler (for better-sqlite3)

### 2. Use as Claude Code Plugin

```bash
claude --plugin-dir /path/to/workflow_bug chat
```

### 3. Use as Standalone CLI (Optional)

```bash
# Make CLI executable
chmod +x bin/bugfix-cli

# Add to PATH or use directly
./bin/bugfix-cli workflow:init my-bugfix bugfix
```

## Quick Start

### As Claude Code Plugin

```bash
# Start bug fix workflow
/workflow_bug:bugfix

# Start feature workflow
/workflow_bug:feature

# Check status
/workflow_bug:status

# Resume workflow
/workflow_bug:resume

# Rewind to checkpoint
/workflow_bug:rewind

# Rebuild index
/workflow_bug:rebuild-index
```

### As Standalone CLI

```bash
# Initialize workflow
./bin/bugfix-cli workflow:init my-bugfix bugfix

# Build code index
./bin/bugfix-cli index:build

# Search files
./bin/bugfix-cli index:search-files memory leak

# Search symbols
./bin/bugfix-cli index:search-symbols process_data

# Parse log file
./bin/bugfix-cli log:parse crash.log

# Discover tests
./bin/bugfix-cli test:discover

# Create git branch
./bin/bugfix-cli git:create-branch bugfix/memory-leak

# Tag checkpoint
./bin/bugfix-cli git:tag-checkpoint checkpoint-analysis "Analysis complete"
```

## Available Skills

When used as Claude Code plugin, the following skills are available:

- **bugfix** - Start bug fixing workflow
- **feature** - Start feature development workflow
- **status** - Check workflow status
- **resume** - Resume interrupted workflow
- **rewind** - Rewind to previous checkpoint
- **rebuild-index** - Rebuild code index

## CLI Commands

### Workflow Management
- `workflow:init <id> <type>` - Initialize workflow
- `workflow:load` - Load current state
- `workflow:advance <phase>` - Advance to next phase
- `workflow:rollback <phase> <tag>` - Rollback to checkpoint

### Code Indexing
- `index:build` - Build code index
- `index:search-files <keywords...>` - Search files by keywords
- `index:search-symbols <name>` - Search symbols by name
- `index:trace-calls <symbol>` - Trace call chains
- `index:analyze-impact <files...>` - Analyze change impact

### Testing
- `test:discover` - Discover test frameworks
- `test:run <testFile>` - Run tests

### Git Operations
- `git:create-branch <name>` - Create branch
- `git:commit <message>` - Commit changes
- `git:tag-checkpoint <tag> <message>` - Create checkpoint
- `git:rewind <tag>` - Rewind to checkpoint

### Log Analysis
- `log:parse <logFile>` - Parse log file
- `log:extract-clues <logFile>` - Extract clues from log

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
- **CLI Tools**: Standalone command-line interface
- **State**: JSON files in `state/` directory
- **Index**: SQLite database in `.bugfix/index.db`

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
./bin/bugfix-cli index:build

# Check workflow
./bin/bugfix-cli workflow:load
```

## Troubleshooting

### Installation fails

If `npm install` fails with native module errors:

```bash
# Install build tools (Ubuntu/Debian)
sudo apt-get install build-essential python3

# Install build tools (macOS)
xcode-select --install

# Install build tools (Windows)
npm install --global windows-build-tools
```

### Skills not showing up

Verify plugin structure:

```bash
./verify-plugin.sh
```

Test plugin loading:

```bash
claude --plugin-dir /path/to/workflow_bug -p "list available skills"
```

## License

MIT
