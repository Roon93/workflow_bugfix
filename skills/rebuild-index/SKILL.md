---
name: rebuild-index
description: Rebuild the code index. Use when the codebase has changed significantly or the index is corrupted.
user-invocable: true
---

# /rebuild-index — Rebuild Code Index

Rebuild the SQLite code index for symbol search, call tracing, and impact analysis.

## Steps

1. **Call `index:build` MCP tool** to rebuild the index:
   ```
   index:build({ repos: [<current repo path>], incremental: false })
   ```
   This tool runs via Node.js (`bin/bugfix-cli`) and uses the bundled
   tree-sitter Node bindings. Do NOT use Python or pip to parse source files.

2. **If the MCP tool is unavailable**, fall back to running the CLI directly:
   ```bash
   node bin/bugfix-cli index:build
   ```

3. **Report results** from the tool response:
   - File count indexed
   - Symbol count
   - Call relationship count

## Important

Always prefer the `index:build` MCP tool. The CLI fallback is only for environments
where the MCP server is not configured. Never run `python`, `pip install tree-sitter`,
or any shell command to parse code — tree-sitter parsing is handled entirely by Node.js.
