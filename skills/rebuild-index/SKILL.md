---
name: rebuild-index
description: Rebuild the code index. Use when the codebase has changed significantly or the index is corrupted.
user-invocable: true
---

# /rebuild-index — Rebuild Code Index

Rebuild the SQLite code index for symbol search, call tracing, and impact analysis.

## Steps

1. **Initialize index database**
   - Create/recreate `.bugfix/index.db`
   - Initialize schema (files, symbols, calls, dependencies, tests)

2. **Scan codebase**
   - Find all source files
   - Parse with Tree-sitter
   - Extract symbols (functions, classes, variables)
   - Build call graph

3. **Store results**
   - Insert into SQLite database
   - Create indexes for fast lookup

4. **Output**
   - File count
   - Symbol count
   - Call relationship count
