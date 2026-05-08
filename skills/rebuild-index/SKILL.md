---
name: rebuild-index
description: Rebuild the code index. Use when the codebase has changed significantly or the index is corrupted.
user-invocable: true
---

# /rebuild-index — Rebuild Code Index

Rebuild the SQLite code index for symbol search, call tracing, and impact analysis.

## Steps

1. **Call `index.build` MCP tool** to rebuild the index:
   ```
   index.build({ repos: [<current repo path>], incremental: false })
   ```
   This tool runs via Node.js (`bin/bugfix-cli`) and uses the bundled
   tree-sitter Node bindings. Do NOT use Bash, Python, or any other
   method to parse source files — only call the MCP tool.

2. **Report results** from the tool response:
   - File count indexed
   - Symbol count
   - Call relationship count

## Important

Always use the `index.build` MCP tool. Never run `python`, `pip install tree-sitter`,
or any shell command to parse code. The tree-sitter parsing is handled entirely
by the Node.js MCP server.
