# workflow_bugfix 接口设计文档

## 1. MCP 工具接口

### 1.1 状态管理接口

#### workflow.init
初始化新的 workflow。

**输入**：
```json
{
  "workflowId": "BUG-123",
  "type": "bugfix | feature",
  "repos": ["firmware-core", "driver-usb"]
}
```

**输出**：
```json
{
  "success": true,
  "workflowFile": "state/workflow.json",
  "stateDir": "state/"
}
```

#### workflow.load
读取当前 workflow 状态。

**输入**：
```json
{}
```

**输出**：
```json
{
  "id": "BUG-123",
  "type": "bugfix",
  "status": "in_progress",
  "currentPhase": "CONTEXT",
  "phases": { ... },
  "loop": { ... }
}
```

#### workflow.advance
推进到下一阶段。

**输入**：
```json
{
  "phase": "CONTEXT",
  "checkpoint": true
}
```

**输出**：
```json
{
  "success": true,
  "previousPhase": "ANALYSIS",
  "currentPhase": "CONTEXT",
  "checkpointTag": "checkpoint-context"
}
```

#### workflow.rollback
回退到指定阶段。

**输入**：
```json
{
  "phase": "ANALYSIS",
  "checkpointTag": "checkpoint-analysis"
}
```

**输出**：
```json
{
  "success": true,
  "rolledBackTo": "ANALYSIS",
  "restoredFiles": ["state/workflow.json", "state/analysis/confirmed.json"]
}
```

---

### 1.2 日志解析接口

#### log.parse
解析日志文件，提取结构化信息。

**输入**：
```json
{
  "logFile": "path/to/log.txt",
  "patterns": ".bugfix/log-patterns.json"
}
```

**输出**：
```json
{
  "entries": [
    {
      "timestamp": "2026-05-03 10:15:23",
      "level": "ERROR",
      "message": "Memory allocation failed",
      "file": "data_processor.c",
      "line": 125,
      "function": "process_data"
    }
  ],
  "summary": {
    "totalLines": 1000,
    "errorCount": 5,
    "warnCount": 12
  }
}
```

#### log.extract-clues
从日志中提取关键线索。

**输入**：
```json
{
  "logFile": "path/to/log.txt",
  "keywords": ["memory", "leak", "malloc"]
}
```

**输出**：
```json
{
  "clues": [
    {
      "type": "error_code",
      "value": "ENOMEM",
      "context": "Memory allocation failed with error ENOMEM"
    },
    {
      "type": "function",
      "value": "process_data",
      "context": "Error occurred in function process_data"
    },
    {
      "type": "file",
      "value": "data_processor.c",
      "context": "File: data_processor.c, Line: 125"
    }
  ]
}
```

---

### 1.3 索引检索接口

#### index.build
构建代码索引。

**输入**：
```json
{
  "repos": [
    {
      "name": "firmware-core",
      "path": "./"
    }
  ],
  "incremental": true,
  "languages": ["c", "cpp"]
}
```

**输出**：
```json
{
  "success": true,
  "indexDb": ".bugfix/index.db",
  "stats": {
    "filesIndexed": 1234,
    "symbolsIndexed": 5678,
    "callsIndexed": 3456
  },
  "duration": 12.5
}
```

#### index.search-files
搜索相关文件。

**输入**：
```json
{
  "keywords": ["memory", "process"],
  "repos": ["firmware-core"],
  "language": "c++",
  "maxResults": 50
}
```

**输出**：
```json
{
  "files": [
    {
      "repo": "firmware-core",
      "path": "src/data_processor.c",
      "relevance": 0.95,
      "matchedLines": [120, 125, 140],
      "snippet": "void process_data() { ... malloc ... }"
    }
  ],
  "totalMatches": 12
}
```

#### index.search-symbols
搜索符号（函数/类/结构体）。

**输入**：
```json
{
  "name": "process_data",
  "type": "function",
  "repos": ["firmware-core"]
}
```

**输出**：
```json
{
  "symbols": [
    {
      "name": "process_data",
      "type": "function",
      "file": "src/data_processor.c",
      "line": 120,
      "signature": "void process_data(const char* input)",
      "references": [
        {
          "file": "src/main.c",
          "line": 45
        }
      ]
    }
  ]
}
```

#### index.trace-calls
追踪调用链。

**输入**：
```json
{
  "symbol": "process_data",
  "direction": "callers | callees | both",
  "maxDepth": 3
}
```

**输出**：
```json
{
  "callChain": [
    {
      "depth": 0,
      "symbol": "process_data",
      "file": "src/data_processor.c",
      "line": 120
    },
    {
      "depth": 1,
      "symbol": "handle_request",
      "file": "src/handler.c",
      "line": 56,
      "relation": "caller"
    },
    {
      "depth": 2,
      "symbol": "main",
      "file": "src/main.c",
      "line": 45,
      "relation": "caller"
    }
  ]
}
```

#### index.analyze-impact
分析影响面（增强版：包含爆炸半径）。

**输入**：
```json
{
  "files": ["src/data_processor.c"],
  "symbols": ["process_data"],
  "includeBlastRadius": true
}
```

**输出**：
```json
{
  "impactScope": {
    "affectedFiles": 5,
    "affectedSymbols": 12,
    "affectedTests": 3,
    "riskLevel": "medium"
  },
  "blastRadius": {
    "directCallers": [
      {"symbol": "handle_request", "file": "src/handler.c", "line": 56}
    ],
    "indirectCallers": [
      {"symbol": "main", "file": "src/main.c", "line": 45, "depth": 2}
    ],
    "dependents": [
      {"file": "src/utils.c", "reason": "includes data_processor.h"}
    ],
    "relatedTests": [
      {"file": "test/test_processor.cpp", "coverage": "direct"}
    ],
    "riskScore": 0.65,
    "riskFactors": [
      "High caller count (12)",
      "Low test coverage (3 tests)",
      "Bridge node (betweenness: 0.45)"
    ]
  },
  "details": {
    "directDependencies": ["src/handler.c", "src/main.c"],
    "indirectDependencies": ["src/utils.c"],
    "relatedTests": ["test/test_processor.cpp"]
  }
}
```

#### index.find-hubs
查找 hub 节点（高连接度节点）。

**输入**：
```json
{
  "topN": 10,
  "excludeFiles": true
}
```

**输出**：
```json
{
  "hubs": [
    {
      "name": "process_data",
      "qualifiedName": "firmware-core::src/data_processor.c::process_data",
      "kind": "function",
      "file": "src/data_processor.c",
      "inDegree": 12,
      "outDegree": 5,
      "totalDegree": 17,
      "communityId": 3
    }
  ]
}
```

#### index.find-bridges
查找 bridge 节点（高 betweenness centrality）。

**输入**：
```json
{
  "topN": 10
}
```

**输出**：
```json
{
  "bridges": [
    {
      "name": "handle_request",
      "qualifiedName": "firmware-core::src/handler.c::handle_request",
      "kind": "function",
      "file": "src/handler.c",
      "betweenness": 0.45,
      "communityId": 3,
      "risk": "high"
    }
  ]
}
```

#### index.detect-communities
检测代码社区（模块聚类）。

**输入**：
```json
{
  "algorithm": "louvain | label_propagation"
}
```

**输出**：
```json
{
  "communities": [
    {
      "id": 1,
      "size": 25,
      "files": ["src/network/*.c"],
      "description": "Network module"
    },
    {
      "id": 2,
      "size": 18,
      "files": ["src/storage/*.c"],
      "description": "Storage module"
    }
  ],
  "modularity": 0.72
}
```

---

### 1.4 测试执行接口

#### test.discover
发现测试框架和测试文件。

**输入**：
```json
{
  "repos": ["firmware-core"],
  "languages": ["c++"]
}
```

**输出**：
```json
{
  "frameworks": [
    {
      "name": "gtest",
      "version": "1.12.0",
      "testDir": "test/",
      "buildFile": "CMakeLists.txt"
    }
  ],
  "testFiles": [
    {
      "path": "test/test_processor.cpp",
      "framework": "gtest",
      "testCount": 5
    }
  ]
}
```

#### test.run
运行测试。

**输入**：
```json
{
  "testFile": "test/test_processor.cpp",
  "testName": "test_process_data_memory_leak",
  "framework": "gtest",
  "timeout": 60
}
```

**输出**：
```json
{
  "status": "passed | failed | skipped",
  "duration": 1.5,
  "stdout": "...",
  "stderr": "...",
  "result": {
    "passed": 4,
    "failed": 1,
    "skipped": 0
  },
  "failures": [
    {
      "testName": "test_process_data_memory_leak",
      "reason": "Memory leak detected: 1024 bytes",
      "file": "test/test_processor.cpp",
      "line": 45
    }
  ]
}
```

#### test.parse-result
解析测试结果。

**输入**：
```json
{
  "stdout": "...",
  "stderr": "...",
  "framework": "gtest"
}
```

**输出**：
```json
{
  "summary": {
    "passed": 10,
    "failed": 2,
    "skipped": 1
  },
  "failures": [
    {
      "testName": "test_memory_leak",
      "reason": "Assertion failed: expected 0, got 1024",
      "file": "test/test_processor.cpp",
      "line": 45
    }
  ]
}
```

---

### 1.5 Git 操作接口

#### git.create-branch
创建分支（多仓库同步）。

**输入**：
```json
{
  "branchName": "bugfix/BUG-123",
  "repos": ["firmware-core", "driver-usb"],
  "baseBranch": "main"
}
```

**输出**：
```json
{
  "success": true,
  "branches": [
    {
      "repo": "firmware-core",
      "branch": "bugfix/BUG-123",
      "baseSha": "abc123"
    },
    {
      "repo": "driver-usb",
      "branch": "bugfix/BUG-123",
      "baseSha": "def456"
    }
  ]
}
```

#### git.commit
提交代码（多仓库同步）。

**输入**：
```json
{
  "message": "fix(BUG-123): 修复内存泄漏",
  "repos": ["firmware-core"],
  "files": ["src/data_processor.c"]
}
```

**输出**：
```json
{
  "success": true,
  "commits": [
    {
      "repo": "firmware-core",
      "sha": "abc123",
      "message": "fix(BUG-123): 修复内存泄漏",
      "files": ["src/data_processor.c"]
    }
  ]
}
```

#### git.tag-checkpoint
创建 checkpoint 标签。

**输入**：
```json
{
  "tag": "checkpoint-context",
  "message": "Phase CONTEXT completed",
  "repos": ["firmware-core", "driver-usb"]
}
```

**输出**：
```json
{
  "success": true,
  "tags": [
    {
      "repo": "firmware-core",
      "tag": "checkpoint-context",
      "sha": "abc123"
    },
    {
      "repo": "driver-usb",
      "tag": "checkpoint-context",
      "sha": "def456"
    }
  ]
}
```

#### git.rewind
回退到指定 checkpoint。

**输入**：
```json
{
  "checkpointTag": "checkpoint-analysis",
  "repos": ["firmware-core", "driver-usb"]
}
```

**输出**：
```json
{
  "success": true,
  "rewound": [
    {
      "repo": "firmware-core",
      "previousSha": "abc123",
      "currentSha": "xyz789"
    },
    {
      "repo": "driver-usb",
      "previousSha": "def456",
      "currentSha": "uvw012"
    }
  ]
}
```

---

### 1.6 多仓库管理接口

#### repo.list
列出所有仓库。

**输入**：
```json
{}
```

**输出**：
```json
{
  "repos": [
    {
      "name": "firmware-core",
      "path": "./",
      "role": "main",
      "currentBranch": "bugfix/BUG-123"
    },
    {
      "name": "driver-usb",
      "path": "../driver-usb",
      "role": "dependency",
      "currentBranch": "bugfix/BUG-123"
    }
  ]
}
```

#### repo.sync-branches
同步创建分支。

**输入**：
```json
{
  "branchName": "bugfix/BUG-123",
  "repos": ["firmware-core", "driver-usb"]
}
```

**输出**：
```json
{
  "success": true,
  "created": ["firmware-core", "driver-usb"],
  "failed": []
}
```

#### repo.sync-commits
同步提交。

**输入**：
```json
{
  "message": "fix(BUG-123): 修复内存泄漏",
  "repos": [
    {
      "name": "firmware-core",
      "files": ["src/data_processor.c"]
    },
    {
      "name": "driver-usb",
      "files": ["src/usb_driver.c"]
    }
  ]
}
```

**输出**：
```json
{
  "success": true,
  "commits": [
    {
      "repo": "firmware-core",
      "sha": "abc123"
    },
    {
      "repo": "driver-usb",
      "sha": "def456"
    }
  ]
}
```

---

## 2. Agent Handoff 接口

### 2.1 AnalysisHandoff

**用途**：analyzer → locator

**Schema**：
```json
{
  "schema_version": "1.0.0",
  "workflowId": "string",
  "type": "bugfix | feature",
  "task": "context-location",
  "input": {
    "classification": "string",
    "keyClues": ["string"],
    "rootCauseHypothesis": ["string"],
    "repos": ["string"]
  },
  "context": {
    "analysisFile": "string",
    "logFile": "string"
  }
}
```

### 2.2 ContextHandoff

**用途**：locator → tester

**Schema**：
```json
{
  "schema_version": "1.0.0",
  "workflowId": "string",
  "type": "bugfix | feature",
  "task": "test-writing",
  "input": {
    "relevantFiles": [
      {
        "repo": "string",
        "path": "string",
        "lines": [120, 145],
        "reason": "string"
      }
    ],
    "relevantSymbols": [
      {
        "name": "string",
        "type": "string",
        "file": "string",
        "line": 120
      }
    ],
    "callChains": ["string"],
    "impactScope": {
      "affectedFiles": 3,
      "affectedFunctions": 5,
      "riskLevel": "low | medium | high"
    }
  },
  "context": {
    "analysisFile": "string",
    "scopeFile": "string",
    "fileSnapshots": "string"
  }
}
```

### 2.3 TestHandoff

**用途**：tester → fixer

**Schema**：
```json
{
  "schema_version": "1.0.0",
  "workflowId": "string",
  "type": "bugfix | feature",
  "task": "fix-implementation",
  "input": {
    "testFile": "string",
    "testResult": {
      "status": "failed",
      "failureReason": "string",
      "failingTest": "string"
    },
    "reproduceStrategy": "code_level | conditional | speculative",
    "confidence": "high | medium | low"
  },
  "context": {
    "analysisFile": "string",
    "scopeFile": "string",
    "acceptanceFile": "string",
    "testResultFile": "string"
  }
}
```

### 2.4 FixHandoff

**用途**：fixer → verifier

**Schema**：
```json
{
  "schema_version": "1.0.0",
  "workflowId": "string",
  "type": "bugfix | feature",
  "task": "verification",
  "input": {
    "fixedFiles": [
      {
        "repo": "string",
        "path": "string",
        "linesChanged": [125, 140],
        "changeType": "string"
      }
    ],
    "testPassed": true,
    "loopRounds": 2,
    "commits": [
      {
        "repo": "string",
        "sha": "string",
        "message": "string"
      }
    ]
  },
  "context": {
    "analysisFile": "string",
    "scopeFile": "string",
    "acceptanceFile": "string",
    "fixResultFile": "string"
  }
}
```

### 2.5 并行任务 Handoff

#### FileSearchHandoff

**用途**：locator-lead → locator-file

**Schema**：
```json
{
  "schema_version": "1.0.0",
  "workflowId": "string",
  "task": "file-search",
  "input": {
    "keywords": ["string"],
    "repos": ["string"],
    "language": "string",
    "maxResults": 50
  },
  "context": {
    "analysisFile": "string"
  }
}
```

#### SymbolSearchHandoff

**用途**：locator-lead → locator-symbol

**Schema**：
```json
{
  "schema_version": "1.0.0",
  "workflowId": "string",
  "task": "symbol-search",
  "input": {
    "symbolNames": ["string"],
    "symbolTypes": ["function", "class"],
    "repos": ["string"]
  },
  "context": {
    "analysisFile": "string"
  }
}
```

#### GraphAnalysisHandoff

**用途**：locator-lead → locator-graph

**Schema**：
```json
{
  "schema_version": "1.0.0",
  "workflowId": "string",
  "task": "graph-analysis",
  "input": {
    "symbols": ["string"],
    "files": ["string"],
    "maxDepth": 3
  },
  "context": {
    "analysisFile": "string"
  }
}
```

---

## 3. 状态文件接口

### 3.1 workflow.json

**路径**：`state/workflow.json`

**Schema**：
```json
{
  "id": "string",
  "type": "bugfix | feature",
  "status": "in_progress | completed | failed",
  "currentPhase": "ANALYSIS | CONTEXT | TEST | ACCEPTANCE | FIX | VERIFY | OUTPUT",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "phases": {
    "ANALYSIS": {
      "status": "pending | in_progress | completed | failed",
      "startedAt": "ISO8601",
      "completedAt": "ISO8601",
      "checkpoint": "string"
    }
  },
  "loop": {
    "currentRound": 1,
    "maxRounds": 5,
    "history": [
      {
        "round": 1,
        "status": "failed",
        "reason": "string",
        "timestamp": "ISO8601"
      }
    ]
  },
  "repos": ["string"],
  "speculativeFix": false
}
```

### 3.2 analysis/confirmed.json

**路径**：`state/analysis/confirmed.json`

**Schema**：
```json
{
  "classification": "string",
  "keyClues": [
    {
      "type": "error_code | function | file | line",
      "value": "string",
      "context": "string"
    }
  ],
  "rootCauseHypothesis": [
    {
      "hypothesis": "string",
      "confidence": "high | medium | low",
      "evidence": ["string"]
    }
  ],
  "reproduceStrategy": "code_level | conditional | speculative",
  "repos": ["string"]
}
```

### 3.3 context/scope.json

**路径**：`state/context/scope.json`

**Schema**：
```json
{
  "relevantFiles": [
    {
      "repo": "string",
      "path": "string",
      "relevance": 0.95,
      "reason": "string",
      "lines": [120, 145]
    }
  ],
  "relevantSymbols": [
    {
      "name": "string",
      "type": "function | class | struct",
      "file": "string",
      "line": 120,
      "signature": "string"
    }
  ],
  "callChains": [
    {
      "chain": ["main", "handle_request", "process_data"],
      "depth": 3
    }
  ],
  "impactScope": {
    "affectedFiles": 5,
    "affectedSymbols": 12,
    "affectedTests": 3,
    "riskLevel": "low | medium | high"
  }
}
```

### 3.4 reproduce/test-result.json

**路径**：`state/reproduce/test-result.json`

**Schema**：
```json
{
  "testFile": "string",
  "testName": "string",
  "framework": "gtest | jest | pytest",
  "status": "passed | failed",
  "duration": 1.5,
  "result": {
    "passed": 0,
    "failed": 1,
    "skipped": 0
  },
  "failures": [
    {
      "testName": "string",
      "reason": "string",
      "file": "string",
      "line": 45
    }
  ],
  "reproduceStrategy": "code_level | conditional | speculative",
  "confidence": "high | medium | low"
}
```

### 3.5 acceptance/confirmed.json

**路径**：`state/acceptance/confirmed.json`

**Schema**：
```json
{
  "criteria": [
    {
      "id": "AC-1",
      "description": "修复后测试通过",
      "type": "functional | performance | security",
      "priority": "must | should | nice-to-have"
    }
  ],
  "constraints": [
    {
      "type": "no-refactor | minimal-change | backward-compatible",
      "description": "string"
    }
  ]
}
```

### 3.6 fix/success.json

**路径**：`state/fix/success.json`

**Schema**：
```json
{
  "fixedFiles": [
    {
      "repo": "string",
      "path": "string",
      "linesChanged": [125, 140],
      "changeType": "string"
    }
  ],
  "testPassed": true,
  "loopRounds": 2,
  "commits": [
    {
      "repo": "string",
      "sha": "string",
      "message": "string",
      "timestamp": "ISO8601"
    }
  ],
  "speculativeFix": false
}
```

### 3.7 verify/report.json

**路径**：`state/verify/report.json`

**Schema**：
```json
{
  "regressionStatus": "passed | failed",
  "testResults": {
    "unit": {
      "passed": 50,
      "failed": 0,
      "skipped": 2
    },
    "integration": {
      "passed": 10,
      "failed": 0,
      "skipped": 0
    }
  },
  "impactAnalysis": {
    "affectedFiles": 5,
    "affectedSymbols": 12,
    "riskLevel": "low | medium | high"
  },
  "recommendations": ["string"]
}
```

---

## 4. CLI 命令接口

### 4.1 bugfix-cli workflow

```bash
# 初始化 workflow
bugfix-cli workflow init --id BUG-123 --type bugfix --repos firmware-core,driver-usb

# 加载当前状态
bugfix-cli workflow load

# 推进阶段
bugfix-cli workflow advance --phase CONTEXT --checkpoint

# 回退阶段
bugfix-cli workflow rollback --phase ANALYSIS --tag checkpoint-analysis
```

### 4.2 bugfix-cli log

```bash
# 解析日志
bugfix-cli log parse --file input.log --patterns .bugfix/log-patterns.json

# 提取线索
bugfix-cli log extract-clues --file input.log --keywords memory,leak,malloc
```

### 4.3 bugfix-cli index

```bash
# 构建索引
bugfix-cli index build --repos firmware-core,driver-usb --incremental

# 搜索文件
bugfix-cli index search-files --keywords memory,process --repo firmware-core --max 50

# 搜索符号
bugfix-cli index search-symbols --name process_data --type function

# 追踪调用链
bugfix-cli index trace-calls --symbol process_data --direction both --depth 3

# 分析影响面
bugfix-cli index analyze-impact --files src/data_processor.c --symbols process_data
```

### 4.4 bugfix-cli test

```bash
# 发现测试
bugfix-cli test discover --repos firmware-core --languages c++

# 运行测试
bugfix-cli test run --file test/test_processor.cpp --name test_memory_leak --framework gtest

# 解析结果
bugfix-cli test parse-result --stdout output.txt --framework gtest
```

### 4.5 bugfix-cli git

```bash
# 创建分支
bugfix-cli git create-branch --name bugfix/BUG-123 --repos firmware-core,driver-usb

# 提交代码
bugfix-cli git commit --message "fix(BUG-123): 修复内存泄漏" --repos firmware-core --files src/data_processor.c

# 创建 checkpoint
bugfix-cli git tag-checkpoint --tag checkpoint-context --message "Phase CONTEXT completed"

# 回退
bugfix-cli git rewind --tag checkpoint-analysis --repos firmware-core,driver-usb
```

### 4.6 bugfix-cli repo

```bash
# 列出仓库
bugfix-cli repo list

# 同步分支
bugfix-cli repo sync-branches --name bugfix/BUG-123 --repos firmware-core,driver-usb

# 同步提交
bugfix-cli repo sync-commits --message "fix(BUG-123): 修复内存泄漏" --repos firmware-core,driver-usb
```

---

## 5. 接口版本管理

### 5.1 版本策略

- **MCP 工具接口**：v1.0.0（稳定）
- **Handoff Schema**：schema_version 字段标识版本
- **状态文件**：向后兼容，新增字段不破坏旧版本
- **CLI 命令**：语义化版本，主版本号变更表示不兼容

### 5.2 兼容性保证

- 新增字段：向后兼容
- 修改字段类型：主版本号 +1
- 删除字段：主版本号 +1
- 新增接口：次版本号 +1

### 5.3 废弃策略

- 废弃接口：标记 `@deprecated`，保留 2 个主版本
- 废弃字段：标记 `deprecated: true`，保留 2 个主版本
- 提供迁移指南
