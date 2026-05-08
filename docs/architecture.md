# workflow_bugfix 架构设计文档

## 1. 架构概览

### 1.1 系统分层

```
┌─────────────────────────────────────────────────────────────┐
│                        用户层                                 │
│  Claude Code CLI / Desktop / Web / IDE Extension            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      插件入口层                               │
│  Skills: /bugfix, /feature, /resume, /status, /rewind       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    协调层 (Lead Agent)                        │
│  bugfix-lead: 阶段转换、任务派发、状态管理                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    执行层 (Specialist Agents)                 │
│  analyzer | locator | tester | fixer | verifier | log-analyzer             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      工具层 (MCP/CLI)                         │
│  状态管理 | 索引检索 | 测试执行 | Git 操作                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      数据层                                   │
│  state/ (JSON) | .bugfix/index.db (SQLite) | Git Repo       │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心原则

1. **插件不自建运行时**：使用 Claude Code 原生 sub-agents
2. **状态驱动**：所有阶段转换基于 `state/workflow.json`
3. **工具隔离**：业务逻辑在 agents，基础能力在 MCP/CLI 工具
4. **可恢复性**：任何时刻中断，可从 `state/` 恢复
5. **最小权限**：每个 agent 只访问必要的上下文
6. **并发优先**：无依赖任务并行执行，减少总耗时
7. **上下文精简**：agent 间传递结构化 Handoff，避免信息失真
8. **大数据隔离**：日志 > 1MB 时由 `log-analyzer` sub-agent 处理，
   主 agent 只接收线索摘要；`log:parse` 工具只返回摘要和错误样本，
   不返回全量条目

## 2. 目录结构

```
workflow_bugfix/
├── .claude-plugin/
│   └── plugin.json                    # 插件元数据
├── agents/
│   ├── bugfix-lead.md                 # 主协调 agent
│   ├── analyzer.md                    # 输入分析 agent
│   ├── locator.md                     # 上下文检索 agent
│   ├── tester.md                      # 测试编写 agent
│   ├── fixer.md                       # 修复实现 agent
│   ├── verifier.md                    # 回归验证 agent
│   ├── log-analyzer.md                # 日志分析 sub-agent（大日志隔离）
├── skills/
│   ├── bugfix-start/
│   │   └── SKILL.md                   # /bugfix 入口
│   ├── feature-start/
│   │   └── SKILL.md                   # /feature 入口
│   ├── resume-workflow/
│   │   └── SKILL.md                   # /resume 入口
│   ├── workflow-status/
│   │   └── SKILL.md                   # /status 入口
│   ├── rewind/
│   │   └── SKILL.md                   # /rewind 入口
│   └── rebuild-index/
│       └── SKILL.md                   # /rebuild-index 入口
├── hooks/
│   └── hooks.json                     # 阶段门控 hooks
├── mcp/
│   └── bugfix-server.json             # MCP 服务器配置
├── bin/
│   └── bugfix-cli                     # CLI 工具（Node.js）
├── schemas/
│   ├── workflow.schema.json           # workflow.json schema
│   ├── analysis.schema.json           # 分析结果 schema
│   ├── context.schema.json            # 上下文 schema
│   ├── test-result.schema.json        # 测试结果 schema
│   ├── acceptance.schema.json         # 验收标准 schema
│   ├── fix-result.schema.json         # 修复结果 schema
│   ├── verify-report.schema.json      # 验证报告 schema
│   └── output.schema.json             # 最终输出 schema
├── templates/
│   ├── workflow.json.template         # workflow 初始模板
│   ├── repos.json.template            # 多仓库配置模板
│   ├── log-patterns.json.template     # 日志格式模板
│   └── report.md.template             # 报告模板
├── lib/
│   ├── state-manager.js               # 状态管理
│   ├── index-builder.js               # 索引构建（多核 worker_threads）
│   ├── index-config.js                # 索引配置加载（.bugfix/index-config.json）
│   ├── makefile-parser.js             # 构建系统解析（compile_commands/CMake/Makefile/Buildroot）
│   ├── repo-manager.js                # 多仓库管理
│   ├── test-runner.js                 # 测试执行
│   ├── git-ops.js                     # Git 操作
│   ├── log-parser.js                  # 日志解析
│   └── context-retriever.js           # 上下文检索
├── spec.md                            # 项目规格说明书
├── architecture.md                    # 本文档
├── README.md                          # 使用说明
└── package.json                       # Node.js 依赖
```

## 3. Agent 角色设计

### 3.1 bugfix-lead（主协调 Agent）

**职责**：
- 读取 `state/workflow.json` 判断当前阶段
- 派发任务给专业 agents
- 管理阶段转换
- 处理用户确认
- 错误处理与回退

**输入**：
- `state/workflow.json`
- 用户命令

**输出**：
- 更新 `state/workflow.json`
- 派发任务给 sub-agents
- 用户提示信息

**工具依赖**：
- `bugfix-cli workflow:load`
- `bugfix-cli workflow:advance`
- `bugfix-cli workflow:rollback`

### 3.2 analyzer（输入分析 Agent）

**职责**：
- Bug 场景：分析现象+日志，提取关键线索，生成根因假设
- Feature 场景：澄清需求，识别改动边界
- 交互式确认，直到用户满意

**输入**：
- 用户原始输入（现象/日志/需求描述）
- 日志文件（如果提供）

**输出**：
- `state/analysis/confirmed.json` 或 `state/requirements/confirmed.json`
- `state/analysis/qa-history.json`（交互历史）

**工具依赖**：
- `log:extract-clues`（提取线索，日志 < 1MB 时直接调用）
- `log:parse`（获取摘要和错误样本，最多 20 条）
- 日志 > 1MB 时启动 `log-analyzer` sub-agent，主 agent 只接收摘要

### 3.3 locator（上下文检索 Agent）

**职责**：
- 四层检索：文件 → 符号 → 路径 → 图谱
- 多仓库检索
- 输出相关文件、符号、调用链、影响面

**输入**：
- `state/analysis/confirmed.json`
- `.bugfix/repos.json`（多仓库配置）

**输出**：
- `state/context/scope.json`
- `state/context/files/`（相关文件快照）

**工具依赖**：
- `bugfix-cli index:search-files`
- `bugfix-cli index:search-symbols`
- `bugfix-cli index:trace-calls`
- `bugfix-cli index:analyze-impact`

### 3.4 tester（测试编写 Agent）

**职责**：
- Bug 场景：编写复现测试（failing test）
- Feature 场景：编写功能测试（failing test）
- 三级复现策略：代码级 → 条件推断 → 推测性

**输入**：
- `state/analysis/confirmed.json`
- `state/context/scope.json`

**输出**：
- `state/reproduce/test-result.json` 或 `state/test/test-result.json`
- `state/reproduce/test-code/` 或 `state/test/test-code/`

**工具依赖**：
- `bugfix-cli test:discover`（发现测试框架）
- `bugfix-cli test:run`（运行测试）
- `bugfix-cli test:parse-result`（解析结果）

### 3.5 fixer（修复实现 Agent）

**职责**：
- TDD Loop：修改代码 → 运行测试 → 失败则重试
- 最多 5 轮
- 检测重复修改和无进展

**输入**：
- `state/reproduce/test-result.json` 或 `state/test/test-result.json`
- `state/context/scope.json`
- `state/acceptance/confirmed.json`

**输出**：
- `state/fix/success.json` 或 `state/impl/success.json`
- `state/fix/loop-history/` 或 `state/impl/loop-history/`
- 修改后的代码文件

**工具依赖**：
- `bugfix-cli test:run`
- `bugfix-cli git:commit`

### 3.6 verifier（回归验证 Agent）

**职责**：
- 运行相关测试套件
- 分析影响面
- 生成验证报告

**输入**：
- `state/fix/success.json` 或 `state/impl/success.json`
- `state/context/scope.json`

**输出**：
- `state/verify/report.json`

**工具依赖**：
- `bugfix-cli test:run`
- `bugfix-cli index:analyze-impact`

## 4. 工具层设计（MCP/CLI）

### 4.1 MCP 服务器

**配置文件**：`mcp/bugfix-server.json`

**暴露的工具**：
```json
{
  "tools": [
    "workflow:init",
    "workflow:load",
    "workflow:advance",
    "workflow:rollback",
    "log:parse",
    "log:extract-clues",
    "index:build",
    "index:search-files",
    "index:search-symbols",
    "index:trace-calls",
    "index:analyze-impact",
    "test:discover",
    "test:run",
    "test:parse-result",
    "git:create-branch",
    "git:commit",
    "git:tag-checkpoint",
    "git:rewind",
    "repo:list",
    "repo:sync-branches"
  ]
}
```

### 4.2 CLI 工具实现

**技术栈**：Node.js + Commander.js

**核心模块**：

#### 4.2.1 state-manager.js
```javascript
// 状态管理
class StateManager {
  init(workflowId, type)           // 初始化 workflow
  load()                           // 读取当前状态
  advance(phase)                   // 推进阶段
  rollback(phase)                  // 回退阶段
  updatePhaseStatus(phase, status) // 更新阶段状态
}
```

#### 4.2.2 index-builder.js
```javascript
// 索引构建（基于 Tree-sitter + worker_threads 多核并行）
class IndexBuilder {
  constructor(dbPath, cfgOverride)     // cfgOverride 可覆盖配置项
  indexDirectory(dirPath, repoRoot)    // 异步，多核并行解析，主线程批量写 SQLite
  indexFile(filePath, repoRoot)        // 同步，单文件（不启 worker）
  searchFiles(keywords, repos, lang, maxResults)
  searchSymbols(name, type, repos, compiledOnly=true) // 默认只查编译文件
  traceCalls(symbol, direction, maxDepth)  // 只查 compiled=1 的文件
  analyzeImpact(files, symbols)
  findHubNodes(topN)                   // 被调用最多的函数
  findBridgeNodes(topN)                // 调用扇出最大的函数
  close()
}
```

**多核架构**：
- `indexDirectory` 启动 `min(CPU核数-1, 8)` 个 worker 线程
- worker 线程只做 tree-sitter 解析，不碰 SQLite（`better-sqlite3` 原生模块仅在主线程加载，worker 加载会导致 SIGABRT）
- worker 通过 `parentPort.close()` 优雅退出，禁止调用 `worker.terminate()`（强制终止会触发 tree-sitter Parser 析构函数在错误线程上下文执行，导致 Napi::Error 崩溃）
- 主线程收到解析结果后批量写入（WAL 模式，batch transaction）
- pipeline 设计：每个 worker 同时持有 2 个待处理批次，减少空闲等待
- 线程数：默认 `floor(cpus * 0.75)`，可通过 `maxWorkers` 配置覆盖（0 = 自动）

**轻量索引（ctags/cscope）**：
- 当 `cfg.indexer` 为 `'ctags'` 或 `'ctags+cscope'` 时，`indexDirectory` 委托给 `lib/ctags-indexer.js`，不启动 worker 线程
- `ctags`：调用 `ctags --output-format=json -R`，解析 JSON 输出写入 symbols 表，calls 表为空
- `ctags+cscope`：ctags 建 symbols，再用 `cscope -b -R -q` 建库，对每个函数符号查询 callees（`cscope -d -L2`）写入 calls 表
- 适用场景：大型 C 项目（如 Linux kernel）需要快速索引时，速度比 tree-sitter 快 10x+

**构建系统过滤**：
- 优先读 `compile_commands.json`（含 `output/compile_commands.json`）；路径支持绝对路径，可通过 `cfgOverride.compileCommandsPaths` 传入临时目录中生成的文件
- 其次 `CMakeLists.txt`，再次 `Makefile`/`.mk`
- Buildroot 项目：解析 `.config` 过滤未启用包的 `package/` 子目录
- 未参与编译的文件标记 `compiled=0`，符号搜索和调用链默认跳过

#### 4.2.3 repo-manager.js
```javascript
// 多仓库管理
class RepoManager {
  loadConfig()                     // 读取 repos.json
  listRepos()                      // 列出所有仓库
  syncBranches(branchName)         // 同步创建分支
  syncCommits(message)             // 同步 commit
  syncRewind(checkpoint)           // 同步回退
}
```

#### 4.2.4 test-runner.js
```javascript
// 测试执行
class TestRunner {
  discover(repo)                   // 发现测试框架
  run(testPath, options)           // 运行测试
  parseResult(output)              // 解析结果
}
```

#### 4.2.5 git-ops.js
```javascript
// Git 操作
class GitOps {
  createBranch(repo, branchName)   // 创建分支
  commit(repo, message, files)     // 提交
  tagCheckpoint(repo, tag)         // 打标签
  rewind(repo, checkpoint)         // 回退
}
```

#### 4.2.6 log-parser.js
```javascript
// 日志解析
class LogParser {
  parse(logContent, patterns)      // 解析日志
  extractClues(parsedLog)          // 提取线索
  buildTimeline(parsedLog)         // 构建时序图
}
```

#### 4.2.7 context-retriever.js
```javascript
// 上下文检索
class ContextRetriever {
  retrieveFiles(clues)             // 文件级检索
  retrieveSymbols(files)           // 符号级检索
  retrievePaths(symbols)           // 路径级检索
  retrieveGraph(paths)             // 图谱级检索
}
```

## 5. 数据模型

### 5.1 state/workflow.json

```json
{
  "id": "BUG-123",
  "type": "bugfix | feature",
  "status": "in_progress | completed | failed",
  "currentPhase": "ANALYSIS | CONTEXT | TEST | ACCEPTANCE | FIX | VERIFY | OUTPUT",
  "createdAt": "2026-05-03T10:00:00Z",
  "updatedAt": "2026-05-03T10:30:00Z",
  "phases": {
    "ANALYSIS": {
      "status": "completed",
      "startedAt": "2026-05-03T10:00:00Z",
      "completedAt": "2026-05-03T10:10:00Z",
      "checkpoint": "checkpoint-analysis"
    },
    "CONTEXT": {
      "status": "in_progress",
      "startedAt": "2026-05-03T10:10:00Z"
    }
  },
  "loop": {
    "currentRound": 1,
    "maxRounds": 5,
    "history": []
  },
  "repos": ["firmware-core", "driver-usb"],
  "speculativeFix": false
}
```

### 5.2 SQLite Schema（实际实现）

```sql
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  language TEXT NOT NULL,
  compiled INTEGER NOT NULL DEFAULT 1,  -- 1=参与编译, 0=未编译（不索引符号）
  indexed_at INTEGER NOT NULL
);
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_symbols_file ON symbols(file);

CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,   -- function, method, class
  file TEXT NOT NULL,
  line INTEGER NOT NULL
);

CREATE TABLE calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caller TEXT NOT NULL,
  callee TEXT NOT NULL,
  file TEXT NOT NULL,
  line INTEGER NOT NULL
);
CREATE INDEX idx_calls_caller ON calls(caller);
CREATE INDEX idx_calls_callee ON calls(callee);
```

**`compiled` 列说明**：
- `1`：文件出现在 `compile_commands.json`/`CMakeLists.txt`/`Makefile` 中，符号和调用链已索引
- `0`：文件存在于源码树但未参与编译（如 Buildroot 中未启用包的源文件），只记录路径，不索引符号
- 所有查询方法（`searchSymbols`、`traceCalls`、`analyzeImpact` 等）默认过滤 `compiled=1`，避免误判

## 6. 并发执行设计

### 6.1 并发分析

**阶段内并发**：

| 阶段 | 可并发任务 | 串行依赖 | 并发收益 |
|------|-----------|---------|---------|
| ANALYSIS | ❌ 单 agent 交互式 | - | 无 |
| CONTEXT | ✅ 文件搜索 ‖ 符号搜索 ‖ 图谱分析 | 结果汇总 | 高（3x） |
| TEST | ❌ 单 agent 编写测试 | - | 无 |
| ACCEPTANCE | ❌ 单 agent 生成 AC | - | 无 |
| FIX | ❌ TDD Loop 串行 | - | 无 |
| VERIFY | ✅ 单测 ‖ 集成测试 ‖ 影响面分析 | 结果汇总 | 中（2x） |
| OUTPUT | ❌ 单 agent 生成报告 | - | 无 |

**跨阶段并发**：
- ❌ 阶段间有严格依赖，无法跨阶段并发
- ✅ 但可以在 CONTEXT 阶段提前触发索引构建（如果索引不存在）

### 6.2 CONTEXT 阶段并发设计

**并行任务**：
```
locator-lead (协调)
    ├─→ locator-file (文件级检索)
    ├─→ locator-symbol (符号级检索)
    └─→ locator-graph (图谱级检索)
         ↓ (并行完成后)
    汇总 → scope.json
```

**实现方式**：
- locator agent 派发 3 个 sub-agents 并行执行
- 每个 sub-agent 接收精简的 Handoff（只包含必要信息）
- 使用 Claude Code 原生 Agent tool 的并行能力
- 汇总时检测冲突（如文件列表重复）

**Handoff 结构**：
```json
{
  "task": "file-search | symbol-search | graph-analysis",
  "input": {
    "keywords": ["memory", "leak"],
    "repos": ["firmware-core", "driver-usb"],
    "constraints": {
      "language": "c++",
      "maxResults": 50
    }
  },
  "context": {
    "workflowId": "BUG-123",
    "analysisResult": "state/analysis/confirmed.json"
  }
}
```

### 6.3 VERIFY 阶段并发设计

**并行任务**：
```
verifier-lead (协调)
    ├─→ verifier-unit (单元测试)
    ├─→ verifier-integration (集成测试)
    └─→ verifier-impact (影响面分析)
         ↓ (并行完成后)
    汇总 → report.json
```

**实现方式**：
- verifier agent 派发 3 个 sub-agents 并行执行
- 单元测试和集成测试可能在不同仓库
- 影响面分析基于 SQLite 图谱，不依赖测试结果

### 6.4 并发控制

**配置**：
```json
{
  "concurrency": {
    "contextPhase": {
      "enabled": true,
      "maxParallel": 3
    },
    "verifyPhase": {
      "enabled": true,
      "maxParallel": 3
    }
  }
}
```

**失败处理**：
- 任一并行任务失败 → 等待其他任务完成 → 汇总失败信息 → 重试或回退
- 超时控制：每个并行任务最多 10 分钟

## 7. 上下文传递机制

### 7.1 Handoff 设计原则

1. **结构化**：JSON 格式，有明确 schema
2. **精简**：只包含必要信息，避免冗余
3. **引用优先**：大文件用路径引用，不直接嵌入
4. **版本化**：包含 schema_version，支持演进

### 7.2 Handoff 类型

#### 7.2.1 AnalysisHandoff（analyzer → locator）

```json
{
  "schema_version": "1.0.0",
  "workflowId": "BUG-123",
  "type": "bugfix",
  "task": "context-location",
  "input": {
    "classification": "memory-leak",
    "keyClues": [
      "malloc without free",
      "function: process_data",
      "file: data_processor.c"
    ],
    "rootCauseHypothesis": [
      "process_data 函数中分配的内存未释放",
      "可能在错误路径上遗漏 free"
    ],
    "repos": ["firmware-core", "driver-usb"]
  },
  "context": {
    "analysisFile": "state/analysis/confirmed.json",
    "logFile": "state/analysis/input.log"
  }
}
```

#### 7.2.2 ContextHandoff（locator → tester）

```json
{
  "schema_version": "1.0.0",
  "workflowId": "BUG-123",
  "type": "bugfix",
  "task": "test-writing",
  "input": {
    "relevantFiles": [
      {
        "repo": "firmware-core",
        "path": "src/data_processor.c",
        "lines": [120, 145],
        "reason": "包含 process_data 函数"
      }
    ],
    "relevantSymbols": [
      {
        "name": "process_data",
        "type": "function",
        "file": "src/data_processor.c",
        "line": 120
      }
    ],
    "callChains": [
      "main → handle_request → process_data"
    ],
    "impactScope": {
      "affectedFiles": 3,
      "affectedFunctions": 5,
      "riskLevel": "medium"
    }
  },
  "context": {
    "analysisFile": "state/analysis/confirmed.json",
    "scopeFile": "state/context/scope.json",
    "fileSnapshots": "state/context/files/"
  }
}
```

#### 7.2.3 TestHandoff（tester → fixer）

```json
{
  "schema_version": "1.0.0",
  "workflowId": "BUG-123",
  "type": "bugfix",
  "task": "fix-implementation",
  "input": {
    "testFile": "state/reproduce/test-code/test_memory_leak.cpp",
    "testResult": {
      "status": "failed",
      "failureReason": "Memory leak detected: 1024 bytes",
      "failingTest": "test_process_data_memory_leak"
    },
    "reproduceStrategy": "code_level",
    "confidence": "high"
  },
  "context": {
    "analysisFile": "state/analysis/confirmed.json",
    "scopeFile": "state/context/scope.json",
    "acceptanceFile": "state/acceptance/confirmed.json",
    "testResultFile": "state/reproduce/test-result.json"
  }
}
```

#### 7.2.4 FixHandoff（fixer → verifier）

```json
{
  "schema_version": "1.0.0",
  "workflowId": "BUG-123",
  "type": "bugfix",
  "task": "verification",
  "input": {
    "fixedFiles": [
      {
        "repo": "firmware-core",
        "path": "src/data_processor.c",
        "linesChanged": [125, 140],
        "changeType": "修复内存泄漏"
      }
    ],
    "testPassed": true,
    "loopRounds": 2,
    "commits": [
      {
        "repo": "firmware-core",
        "sha": "abc123",
        "message": "fix(BUG-123): 修复 process_data 内存泄漏"
      }
    ]
  },
  "context": {
    "analysisFile": "state/analysis/confirmed.json",
    "scopeFile": "state/context/scope.json",
    "acceptanceFile": "state/acceptance/confirmed.json",
    "fixResultFile": "state/fix/success.json"
  }
}
```

### 7.3 上下文传递流程

```
bugfix-lead
    ↓ (构建 AnalysisHandoff)
analyzer
    ↓ (输出 state/analysis/confirmed.json)
bugfix-lead
    ↓ (构建 ContextHandoff，派发并行任务)
locator-lead
    ├─→ locator-file (FileSearchHandoff)
    ├─→ locator-symbol (SymbolSearchHandoff)
    └─→ locator-graph (GraphAnalysisHandoff)
    ↓ (汇总输出 state/context/scope.json)
bugfix-lead
    ↓ (构建 TestHandoff)
tester
    ↓ (输出 state/reproduce/test-result.json)
bugfix-lead
    ↓ (构建 AcceptanceHandoff，用户确认)
bugfix-lead
    ↓ (构建 FixHandoff)
fixer
    ↓ (输出 state/fix/success.json)
bugfix-lead
    ↓ (构建 VerifyHandoff，派发并行任务)
verifier-lead
    ├─→ verifier-unit (UnitTestHandoff)
    ├─→ verifier-integration (IntegrationTestHandoff)
    └─→ verifier-impact (ImpactAnalysisHandoff)
    ↓ (汇总输出 state/verify/report.json)
bugfix-lead
    ↓ (生成最终报告)
```

### 7.4 信息失真防护

**问题**：
- Agent 间传递大量上下文 → token 消耗高 → 可能截断
- 截断导致信息丢失 → 决策错误

**解决方案**：
1. **引用优先**：大文件写入 `state/`，Handoff 只传路径
2. **摘要提取**：对长文本提取关键信息（如日志只传关键行）
3. **分层传递**：
   - L1: 必要信息（直接嵌入 Handoff）
   - L2: 参考信息（文件路径引用）
   - L3: 完整上下文（agent 按需读取）
4. **校验机制**：Handoff 包含 checksum，接收方验证完整性

**示例**：
```json
{
  "input": {
    "keyClues": ["malloc without free"],  // L1: 直接嵌入
    "logSummary": {                        // L1: 摘要
      "errorLines": 3,
      "firstError": "line 1234: memory leak detected"
    }
  },
  "context": {
    "logFile": "state/analysis/input.log", // L2: 引用
    "checksum": "sha256:abc123..."         // 校验
  }
}
```

## 8. 工作流状态机

```
## 8. 工作流状态机

```
                    ┌─────────────┐
                    │   INIT      │
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
                    │  ANALYSIS   │ ← 用户确认
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
              ┌────→│  CONTEXT    │ ← 用户确认（并行：文件‖符号‖图谱）
              │     └──────┬──────┘
              │            ↓
              │     ┌─────────────┐
              │     │    TEST     │
              │     └──────┬──────┘
              │            ↓
              │     ┌─────────────┐
              │     │ ACCEPTANCE  │ ← 用户确认
              │     └──────┬──────┘
              │            ↓
              │     ┌─────────────┐
              │ ┌──→│    FIX      │────┐
              │ │   └──────┬──────┘    │
              │ │          ↓           │
              │ │   ┌─────────────┐    │
              │ │   │ Test Failed │    │
              │ │   └──────┬──────┘    │
              │ │          ↓           │
              │ │   ┌─────────────┐    │
              │ └───│ Retry Loop  │    │ (max 5 rounds)
              │     └─────────────┘    │
              │            ↓           │
              │     ┌─────────────┐    │
              │     │ Test Passed │←───┘
              │     └──────┬──────┘
              │            ↓
              │     ┌─────────────┐
              │     │   VERIFY    │ ← 用户确认（并行：单测‖集成‖影响面）
              │     └──────┬──────┘
              │            ↓
              │     ┌─────────────┐
              │     │Verify Failed│
              │     └──────┬──────┘
              │            │
              └────────────┘ (回退到 FIX)
                           ↓
                    ┌─────────────┐
                    │   OUTPUT    │
                    └──────┬──────┘
                           ↓
                    ┌─────────────┐
                    │  COMPLETED  │
                    └─────────────┘
```

## 9. 错误处理策略

### 7.1 错误分类

| 错误类型 | 处理策略 | 回退目标 |
|---------|---------|---------|
| 用户输入不明确 | analyzer 交互式澄清 | 当前阶段 |
| 上下文检索失败 | 扩大搜索范围 / 人工介入 | CONTEXT 阶段 |
| 测试编写失败 | 标记推测性修复 / 人工介入 | TEST 阶段 |
| TDD Loop 超限 | 标记失败，人工介入 | FIX 阶段 |
| 回归验证失败 | 回退到 FIX 阶段重试 | FIX 阶段 |
| Git 操作失败 | 暂停，人工介入 | 当前阶段 |
| 工具不可用 | 暂停，人工介入 | 当前阶段 |

### 7.2 重试机制

```javascript
// TDD Loop 重试逻辑
class TDDLoop {
  async execute(maxRounds = 5) {
    for (let round = 1; round <= maxRounds; round++) {
      const result = await this.runTest();
      
      if (result.passed) {
        return { success: true, round };
      }
      
      if (round === maxRounds) {
        return { success: false, reason: 'max_rounds_exceeded' };
      }
      
      // 检测重复修改
      if (this.detectDuplicate(result)) {
        return { success: false, reason: 'duplicate_fix' };
      }
      
      // 检测无进展
      if (this.detectNoProgress(result)) {
        return { success: false, reason: 'no_progress' };
      }
      
      // 分析失败原因，准备下一轮
      await this.analyzeFail(result);
    }
  }
}
```

## 8. 多仓库协调

### 8.1 分支同步

```javascript
// 多仓库分支同步
class MultiRepoSync {
  async createBranches(workflowId, repos) {
    const branchName = `bugfix/${workflowId}`;
    const results = [];
    
    for (const repo of repos) {
      const result = await gitOps.createBranch(repo.path, branchName);
      results.push({ repo: repo.name, result });
    }
    
    return results;
  }
  
  async syncCommits(message, repos) {
    const results = [];
    
    for (const repo of repos) {
      if (repo.hasChanges) {
        const result = await gitOps.commit(repo.path, message);
        results.push({ repo: repo.name, result });
      }
    }
    
    return results;
  }
}
```

### 8.2 跨仓库索引

```javascript
// 跨仓库符号索引
class CrossRepoIndex {
  async buildIndex(repos) {
    const db = await this.openDb();
    
    for (const repo of repos) {
      // 扫描文件
      const files = await this.scanFiles(repo.path);
      
      // 提取符号
      for (const file of files) {
        const symbols = await this.extractSymbols(file);
        await this.insertSymbols(db, repo.name, file, symbols);
      }
      
      // 分析调用关系
      await this.analyzeCalls(db, repo.name);
    }
    
    // 跨仓库依赖分析
    await this.analyzeCrossRepoDeps(db, repos);
  }
}
```

## 9. 性能优化

### 9.1 索引构建优化

- **多核并行**：`worker_threads` 并行 tree-sitter 解析，worker 数 = `floor(cpus * 0.75)`（可通过 `maxWorkers` 配置）
- **轻量索引**：`indexer: "ctags+cscope"` 模式跳过 worker 线程，直接调用系统工具，适合大型 C 项目快速索引
- **批量事务**：主线程每批结果一次性写入 SQLite（WAL 模式），避免逐行提交
- **增量更新**：基于 SHA-256 哈希跳过未变更文件
- **目录过滤**：`SKIP_DIRS` 跳过 `output`/`dl`/`node_modules`/`vendor` 等无效目录（可配置）
- **文件过滤**：512KB 大小限制 + 二进制文件检测（首 8KB 空字节探测）
- **构建系统过滤**：只索引参与编译的文件，Buildroot 项目可减少 80%+ 的无效索引量
- **预编译语句**：所有 SQLite 操作使用 `prepare()` 预编译，避免重复解析 SQL

### 9.2 上下文检索优化

- **分层检索**：先文件级（快），再符号级（中），最后图谱级（慢）
- **早停策略**：找到足够上下文即停止
- **compiled 过滤**：默认只查 `compiled=1` 的文件，减少噪音

### 9.3 测试执行优化

- **增量测试**：只运行相关测试
- **并行执行**：多测试并行运行（如果支持）
- **超时控制**：单个测试超时自动终止

## 10. 安全考虑

### 10.1 代码执行安全

- **沙箱执行**：测试在隔离环境运行
- **超时限制**：防止无限循环
- **资源限制**：限制内存和 CPU 使用

### 10.2 Git 操作安全

- **分支隔离**：所有修改在独立分支
- **Checkpoint 保护**：每阶段自动 commit
- **Rewind 确认**：回退前用户确认

### 10.3 数据安全

- **敏感信息过滤**：日志中的密码、token 自动脱敏
- **本地存储**：所有数据本地存储，不上传云端

## 11. 可扩展性

### 11.1 新语言支持

- **插件化解析器**：tree-sitter 支持多语言
- **配置驱动**：通过配置文件添加新语言

### 11.2 新测试框架支持

- **适配器模式**：每个测试框架一个适配器
- **自动发现**：扫描构建文件自动识别

### 11.3 新工具集成

- **MCP 扩展**：通过 MCP 协议集成新工具
- **CLI 扩展**：通过子命令扩展新功能

## 12. 部署与分发

### 12.1 插件安装

```bash
# 克隆仓库
git clone https://github.com/xxx/workflow_bugfix.git

# 安装依赖
cd workflow_bugfix
npm install

# 链接到 Claude Code
ln -s $(pwd) ~/.claude/plugins/workflow_bugfix
```

### 12.2 配置初始化

```bash
# 在项目根目录初始化配置
cd /path/to/your/project
bugfix-cli init

# 生成配置文件
# - bugfix.config.json
# - .bugfix/repos.json
# - .bugfix/log-patterns.json (可选)
```

### 12.3 索引构建

```bash
# 首次构建索引
bugfix-cli index build

# 增量更新索引
bugfix-cli index update
```

## 13. 监控与调试

### 13.1 日志记录

- **Agent 日志**：每个 agent 的执行日志存入 `state/logs/`
- **工具日志**：CLI 工具日志存入 `.bugfix/logs/`
- **错误日志**：错误堆栈存入 `state/errors/`

### 13.2 状态追踪

- **阶段追踪**：`workflow.json` 记录每个阶段的时间戳
- **Loop 追踪**：`loop-history/` 记录每轮修改和测试结果
- **Git 追踪**：每个 checkpoint 对应一个 git tag

### 13.3 调试工具

```bash
# 查看当前状态
bugfix-cli status

# 查看阶段历史
bugfix-cli history

# 查看 loop 历史
bugfix-cli loop-history

# 查看索引统计
bugfix-cli index stats
```

## 14. 测试策略

### 14.1 单元测试

- **工具层测试**：每个 CLI 模块独立测试
- **覆盖率要求**：核心模块 > 80%

### 14.2 集成测试

- **端到端测试**：完整 workflow 测试
- **多仓库测试**：跨仓库场景测试
- **错误场景测试**：各种失败场景测试

### 14.3 性能测试

- **索引构建性能**：大型仓库（10k+ 文件）
- **检索性能**：复杂查询响应时间
- **测试执行性能**：大型测试套件

## 15. 文档体系

```
docs/
├── user-guide.md              # 用户使用指南
├── agent-guide.md             # Agent 开发指南
├── tool-guide.md              # 工具开发指南
├── config-reference.md        # 配置参考
├── api-reference.md           # API 参考
├── troubleshooting.md         # 故障排查
└── examples/
    ├── bugfix-example.md      # Bug 修复示例
    ├── feature-example.md     # Feature 开发示例
    └── multi-repo-example.md  # 多仓库示例
```

## 16. 里程碑规划

### Phase 1: 核心框架（2 周）
- ✅ 插件结构搭建
- ✅ 状态管理实现
- ✅ Git 操作实现
- ✅ 基础 CLI 工具

### Phase 2: 索引与检索（2 周）
- ✅ 索引构建（单仓库）
- ✅ 四层检索实现
- ✅ 多仓库支持
- ✅ 增量更新

### Phase 3: Agent 实现（3 周）
- ✅ bugfix-lead
- ✅ analyzer
- ✅ locator
- ✅ tester
- ✅ fixer
- ✅ verifier

### Phase 4: 测试与优化（2 周）
- ✅ 单元测试
- ✅ 集成测试
- ✅ 性能优化
- ✅ 文档完善

### Phase 5: 发布与迭代（持续）
- ✅ Beta 测试
- ✅ 用户反馈
- ✅ Bug 修复
- ✅ 功能迭代
