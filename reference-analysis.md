# 参考项目分析与设计补充

## 1. 参考项目核心价值

### 1.1 token-savior
**核心能力**：
- **符号级导航**：通过符号索引（函数/类/导入/调用图）精确定位，避免全文读取
- **持久化记忆**：SQLite + FTS5 + 向量嵌入，存储决策/bugfix/约定/guardrail
- **渐进式披露**：3 层契约（memory_index → memory_search → memory_get）
- **贝叶斯有效性**：每个观察带有效性先验，过期观察会被标记
- **矛盾检测**：保存时检测与现有索引的矛盾
- **Token 节省**：97% 字符注入减少，100% benchmark 得分

**关键技术**：
- Tree-sitter 解析
- SQLite WAL + FTS5
- 向量搜索（all-MiniLM-L6-v2, 384d）
- BM25 + 向量融合（RRF）
- 符号内容哈希（检测过期）

### 1.2 code-review-graph
**核心能力**：
- **爆炸半径分析**：追踪每个变更的调用者、依赖者、测试
- **增量更新**：< 2 秒重建索引（2900 文件项目）
- **图谱分析**：hub 节点、bridge 节点、社区检测
- **最小审查集**：只读取受影响的文件
- **8.2x Token 减少**：跨 6 个真实仓库

**关键技术**：
- Tree-sitter AST 解析
- SQLite 图存储（节点+边）
- SHA-256 哈希检测变更
- NetworkX 图分析（betweenness centrality）
- Git hook 触发增量更新

### 1.3 claude-context
**核心能力**：
- **语义代码搜索**：向量数据库存储整个代码库
- **成本优化**：只加载相关代码到上下文
- **MCP 集成**：支持 Claude Code、Cursor、Windsurf 等

**关键技术**：
- Zilliz Cloud 向量数据库
- OpenAI embedding 模型
- 语义搜索 + 相关性排序

---

## 2. 对 workflow_bugfix 的启发

### 2.1 必须借鉴的能力

#### A. 符号级索引（from token-savior）
**当前设计**：四层检索（文件→符号→路径→图谱）
**补充**：
- 使用 Tree-sitter 解析（支持 C/C++/TS/Python）
- 符号内容哈希（检测代码变更）
- 调用图存储（caller/callee 关系）

#### B. 爆炸半径分析（from code-review-graph）
**当前设计**：影响面分析
**补充**：
- 追踪调用者链（谁调用了这个函数）
- 追踪依赖者链（谁依赖了这个模块）
- 追踪测试覆盖（哪些测试覆盖了这个代码）
- 计算 betweenness centrality（识别关键节点）

#### C. 增量索引（from code-review-graph）
**当前设计**：增量更新策略
**补充**：
- Git hook 触发（post-commit, post-merge）
- SHA-256 哈希检测变更文件
- 只重建变更文件及其依赖者
- 目标：< 2 秒重建（中型项目）

#### D. 渐进式披露（from token-savior）
**当前设计**：Handoff 引用优先
**补充**：
- L1: 索引摘要（文件列表+符号列表）
- L2: 详细信息（符号定义+引用位置）
- L3: 完整内容（按需读取文件）

### 2.2 可选增强能力

#### E. 持久化记忆（from token-savior）
**用途**：跨 workflow 记忆
- 历史 Bug 模式
- 修复策略
- 代码约定
- 风险区域

**实现**：
- SQLite 表：`memory_observations`
- 类型：bug_pattern, fix_strategy, code_convention, risk_area
- 搜索：BM25 + 向量（可选）
- 衰减：TTL + LRU

#### F. 语义搜索（from claude-context）
**用途**：模糊匹配
- 日志描述 → 相关代码
- Bug 现象 → 相似历史 Bug
- 需求描述 → 参考实现

**实现**：
- 向量数据库（可选，MVP 暂缓）
- Embedding 模型（OpenAI/本地）
- 相关性排序

---

## 3. 更新后的架构设计

### 3.1 索引构建增强

**Tree-sitter 解析**：
```javascript
class IndexBuilder {
  // 使用 Tree-sitter 解析
  parseFile(filePath, language) {
    const parser = new Parser();
    parser.setLanguage(getLanguage(language));
    const tree = parser.parse(readFile(filePath));
    return extractSymbols(tree);
  }
  
  // 提取符号
  extractSymbols(tree) {
    return {
      functions: [...],
      classes: [...],
      imports: [...],
      calls: [...]
    };
  }
  
  // 计算内容哈希
  computeHash(symbol) {
    return sha256(symbol.content);
  }
}
```

**增量更新**：
```javascript
class IncrementalIndexer {
  // Git hook 触发
  async onGitCommit() {
    const changedFiles = await git.diff('HEAD~1', 'HEAD');
    const affectedFiles = await this.findAffectedFiles(changedFiles);
    await this.rebuildIndex(affectedFiles);
  }
  
  // 查找受影响文件
  async findAffectedFiles(changedFiles) {
    const affected = new Set(changedFiles);
    for (const file of changedFiles) {
      const dependents = await db.query(
        'SELECT DISTINCT from_file FROM dependencies WHERE to_file = ?',
        [file]
      );
      dependents.forEach(d => affected.add(d.from_file));
    }
    return Array.from(affected);
  }
}
```

### 3.2 爆炸半径分析

**新增 MCP 工具**：
```json
{
  "tools": [
    "index.blast-radius",
    "index.find-hubs",
    "index.find-bridges",
    "index.detect-communities"
  ]
}
```

**实现**：
```javascript
class BlastRadiusAnalyzer {
  // 计算爆炸半径
  async computeBlastRadius(files, symbols) {
    const callers = await this.traceCallers(symbols);
    const dependents = await this.traceDependents(files);
    const tests = await this.findRelatedTests(files, symbols);
    
    return {
      directImpact: { callers, dependents },
      indirectImpact: await this.traceTransitive(callers, dependents),
      testCoverage: tests,
      riskScore: this.computeRiskScore(callers, dependents, tests)
    };
  }
  
  // 计算风险分数
  computeRiskScore(callers, dependents, tests) {
    const callerCount = callers.length;
    const dependentCount = dependents.length;
    const testCount = tests.length;
    
    // 高调用者 + 低测试覆盖 = 高风险
    if (callerCount > 10 && testCount < 3) return 'high';
    if (callerCount > 5 && testCount < 5) return 'medium';
    return 'low';
  }
}
```

### 3.3 渐进式上下文传递

**Handoff 分层**：
```json
{
  "schema_version": "1.0.0",
  "workflowId": "BUG-123",
  "task": "context-location",
  
  "L1_index": {
    "files": ["src/data_processor.c", "src/handler.c"],
    "symbols": ["process_data", "handle_request"],
    "totalSize": "2.5KB"
  },
  
  "L2_references": {
    "scopeFile": "state/context/scope.json",
    "fileSnapshots": "state/context/files/",
    "callGraph": "state/context/call-graph.json"
  },
  
  "L3_onDemand": {
    "instruction": "Use index.search-symbols and Read tools to fetch full content when needed"
  }
}
```

### 3.4 SQLite Schema 增强

**新增表**：
```sql
-- 符号内容哈希（检测变更）
CREATE TABLE symbol_hashes (
  symbol_id INTEGER PRIMARY KEY,
  content_hash TEXT NOT NULL,
  last_updated INTEGER,
  FOREIGN KEY(symbol_id) REFERENCES symbols(id)
);

-- 爆炸半径缓存
CREATE TABLE blast_radius_cache (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  symbol_name TEXT,
  radius_json TEXT, -- JSON: {callers, dependents, tests}
  computed_at INTEGER,
  UNIQUE(file_path, symbol_name)
);

-- 持久化记忆（可选）
CREATE TABLE memory_observations (
  id INTEGER PRIMARY KEY,
  type TEXT, -- bug_pattern, fix_strategy, code_convention, risk_area
  content TEXT,
  context_json TEXT,
  validity_score REAL DEFAULT 1.0,
  access_count INTEGER DEFAULT 0,
  created_at INTEGER,
  expires_at INTEGER
);

-- 社区检测结果
CREATE TABLE communities (
  id INTEGER PRIMARY KEY,
  symbol_id INTEGER,
  community_id INTEGER,
  FOREIGN KEY(symbol_id) REFERENCES symbols(id)
);
```

---

## 4. 更新后的接口设计

### 4.1 新增 MCP 工具

#### index.blast-radius
计算变更的爆炸半径。

**输入**：
```json
{
  "files": ["src/data_processor.c"],
  "symbols": ["process_data"]
}
```

**输出**：
```json
{
  "blastRadius": {
    "directCallers": [
      {"symbol": "handle_request", "file": "src/handler.c", "line": 56}
    ],
    "indirectCallers": [
      {"symbol": "main", "file": "src/main.c", "line": 45, "depth": 2}
    ],
    "dependentFiles": ["src/handler.c", "src/main.c"],
    "relatedTests": ["test/test_processor.cpp"],
    "riskScore": "medium",
    "estimatedImpact": {
      "filesAffected": 3,
      "symbolsAffected": 5,
      "testsRequired": 2
    }
  }
}
```

#### index.find-hubs
查找 hub 节点（高连接度）。

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
      "qualifiedName": "data_processor::process_data",
      "kind": "function",
      "file": "src/data_processor.c",
      "inDegree": 15,
      "outDegree": 8,
      "totalDegree": 23,
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
      "qualifiedName": "handler::handle_request",
      "kind": "function",
      "file": "src/handler.c",
      "betweenness": 0.45,
      "communityId": 2,
      "reason": "Connects UI layer to data processing layer"
    }
  ]
}
```

#### index.incremental-update
增量更新索引。

**输入**：
```json
{
  "changedFiles": ["src/data_processor.c"],
  "baseBranch": "main"
}
```

**输出**：
```json
{
  "success": true,
  "stats": {
    "filesChanged": 1,
    "filesReindexed": 3,
    "filesSkipped": 1231,
    "duration": 1.8
  },
  "affectedSymbols": ["process_data", "cleanup_data"]
}
```

---

## 5. MVP 范围调整

### 必做（基于参考项目）
1. ✅ Tree-sitter 符号解析
2. ✅ 符号内容哈希（检测变更）
3. ✅ 爆炸半径分析
4. ✅ 增量索引（Git hook）
5. ✅ Hub/Bridge 节点识别
6. ✅ 渐进式上下文传递（L1/L2/L3）

### 暂缓（可选增强）
1. ❌ 持久化记忆（跨 workflow）
2. ❌ 语义搜索（向量数据库）
3. ❌ 社区检测（NetworkX）
4. ❌ 贝叶斯有效性评分

---

## 6. 实现优先级

**P0（核心）**：
1. Tree-sitter 解析器集成
2. 符号索引构建
3. 爆炸半径分析
4. 增量索引

**P1（重要）**：
1. Hub/Bridge 节点识别
2. 渐进式上下文传递
3. Git hook 集成

**P2（增强）**：
1. 持久化记忆
2. 语义搜索
3. 社区检测
