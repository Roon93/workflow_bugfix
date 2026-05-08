const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const Parser = require('tree-sitter');
const C = require('tree-sitter-c');
const Cpp = require('tree-sitter-cpp');
const TypeScript = require('tree-sitter-typescript').typescript;
const TSX = require('tree-sitter-typescript').tsx;
const Python = require('tree-sitter-python');

const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.svn', '.hg',
  'build', 'dist', 'out', 'output', 'target',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.tox',
  'vendor', 'third_party', 'third-party', 'thirdparty',
  '.cache', '.tmp', 'tmp', 'temp',
  'coverage', '.nyc_output',
  'CMakeFiles', '.cmake',
]);

const SOURCE_EXTS = new Set([
  '.c', '.h', '.cpp', '.cc', '.cxx', '.hpp',
  '.ts', '.tsx', '.js', '.jsx',
  '.py',
]);

const EXT_LANG = {
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.ts': 'typescript', '.tsx': 'tsx',
  '.js': 'typescript', '.jsx': 'tsx',
  '.py': 'python',
};

const MAX_FILE_SIZE = 512 * 1024; // 512KB — 超过此大小的文件跳过
const BATCH_SIZE = 200;           // 每批提交一次事务

class IndexBuilder {
  constructor(dbPath) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    this.db = new Database(dbPath);
    // WAL 模式：写入不阻塞读取，大幅提升并发和批量写入速度
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -32000'); // 32MB page cache
    this.db.pragma('temp_store = MEMORY');

    this.parsers = this._initParsers();
    this._initSchema();
    this._prepareStmts();
  }

  _initParsers() {
    const make = (lang) => { const p = new Parser(); p.setLanguage(lang); return p; };
    return {
      c: make(C), cpp: make(Cpp),
      typescript: make(TypeScript), tsx: make(TSX),
      python: make(Python),
    };
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        language TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file);
      CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caller TEXT NOT NULL,
        callee TEXT NOT NULL,
        file TEXT NOT NULL,
        line INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller);
      CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee);
    `);
  }

  // 预编译所有语句，避免每次 indexFile 都重新编译
  _prepareStmts() {
    this.stmts = {
      getFile:    this.db.prepare('SELECT hash FROM files WHERE path = ?'),
      upsertFile: this.db.prepare('INSERT OR REPLACE INTO files (path, hash, language, indexed_at) VALUES (?, ?, ?, ?)'),
      delSymbols: this.db.prepare('DELETE FROM symbols WHERE file = ?'),
      delCalls:   this.db.prepare('DELETE FROM calls WHERE file = ?'),
      insSymbol:  this.db.prepare('INSERT INTO symbols (name, type, file, line) VALUES (?, ?, ?, ?)'),
      insCall:    this.db.prepare('INSERT INTO calls (caller, callee, file, line) VALUES (?, ?, ?, ?)'),
    };
  }

  computeHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // 收集目录下所有待索引文件路径（迭代，不递归，避免栈溢出）
  collectFiles(dirPath) {
    const result = [];
    const queue = [dirPath];
    while (queue.length > 0) {
      const cur = queue.pop();
      let entries;
      try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
      catch { continue; }

      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.') continue;
        const full = path.join(cur, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) queue.push(full);
        } else if (entry.isFile() && SOURCE_EXTS.has(path.extname(entry.name))) {
          result.push(full);
        }
      }
    }
    return result;
  }

  // 批量事务写入：每 BATCH_SIZE 个文件提交一次，大幅减少 fsync 次数
  indexDirectory(dirPath, repoRoot = '') {
    const root = repoRoot || dirPath;
    const files = this.collectFiles(dirPath);
    const total = files.length;
    let indexed = 0, skipped = 0;

    process.stderr.write(`[index-builder] found ${total} source files\n`);

    const runBatch = this.db.transaction((batch) => {
      for (const filePath of batch) {
        const result = this._indexFileTx(filePath, root);
        if (result === 'indexed') indexed++;
        else skipped++;
      }
    });

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      runBatch(files.slice(i, i + BATCH_SIZE));
      if ((i + BATCH_SIZE) % 2000 === 0) {
        process.stderr.write(`[index-builder] progress: ${Math.min(i + BATCH_SIZE, total)}/${total}\n`);
      }
    }

    process.stderr.write(`[index-builder] done: ${indexed} indexed, ${skipped} skipped\n`);
    return { total, indexed, skipped };
  }

  // 单文件索引逻辑（在事务内调用）
  _indexFileTx(filePath, repoRoot) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) return 'skipped';

      const lang = EXT_LANG[path.extname(filePath)];
      const parser = this.parsers[lang];
      if (!parser) return 'skipped';

      const raw = fs.readFileSync(filePath);
      // 二进制检测：前 8KB 有 null byte 则跳过
      if (raw.slice(0, 8192).indexOf(0) !== -1) return 'skipped';

      const content = raw.toString('utf8');
      const hash = this.computeHash(content);
      const relPath = path.relative(repoRoot, filePath);

      const existing = this.stmts.getFile.get(relPath);
      if (existing?.hash === hash) return 'skipped';

      const tree = parser.parse(content);
      if (!tree?.rootNode) return 'skipped';

      this.stmts.delSymbols.run(relPath);
      this.stmts.delCalls.run(relPath);
      this.stmts.upsertFile.run(relPath, hash, lang, Date.now());
      this._extractSymbols(tree.rootNode, relPath, content);
      this._extractCalls(tree.rootNode, relPath, content);
      return 'indexed';
    } catch (err) {
      process.stderr.write(`[index-builder] skip ${filePath}: ${err.message}\n`);
      return 'skipped';
    }
  }

  // 兼容旧接口：单文件索引（自动包一个事务）
  indexFile(filePath, repoRoot = '') {
    const root = repoRoot || path.dirname(filePath);
    this.db.transaction(() => this._indexFileTx(filePath, root))();
  }

  detectLanguage(filePath) {
    return EXT_LANG[path.extname(filePath)] || 'unknown';
  }

  _extractSymbols(rootNode, filePath, content) {
    const symbolTypes = {
      function_definition: 'function',
      function_declaration: 'function',
      method_definition: 'method',
      class_declaration: 'class',
      class_definition: 'class',
      function_item: 'function',
    };
    const stack = [rootNode];
    while (stack.length > 0) {
      const node = stack.pop();
      const symType = symbolTypes[node.type];
      if (symType) {
        const nameNode = node.childForFieldName('name') || node.childForFieldName('declarator');
        if (nameNode) {
          const name = content.substring(nameNode.startIndex, nameNode.endIndex);
          this.stmts.insSymbol.run(name, symType, filePath, node.startPosition.row + 1);
        }
      }
      for (const child of node.children) stack.push(child);
    }
  }

  _extractCalls(rootNode, filePath, content) {
    const stack = [rootNode];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node.type === 'call_expression') {
        const funcNode = node.childForFieldName('function');
        if (funcNode) {
          const callee = content.substring(funcNode.startIndex, funcNode.endIndex);
          const caller = this._findEnclosingFunction(node, content);
          if (caller) this.stmts.insCall.run(caller, callee, filePath, node.startPosition.row + 1);
        }
      }
      for (const child of node.children) stack.push(child);
    }
  }

  _findEnclosingFunction(node, content) {
    let cur = node.parent;
    while (cur) {
      if (cur.type === 'function_definition' || cur.type === 'method_definition') {
        const nameNode = cur.childForFieldName('name') || cur.childForFieldName('declarator');
        if (nameNode) return content.substring(nameNode.startIndex, nameNode.endIndex);
      }
      cur = cur.parent;
    }
    return null;
  }

  searchFiles(keywords, repos = [], language = null, maxResults = 50) {
    let query = 'SELECT path, language FROM files WHERE 1=1';
    const params = [];
    if (language) { query += ' AND language = ?'; params.push(language); }
    if (keywords.length > 0) {
      query += ' AND (' + keywords.map(() => 'path LIKE ?').join(' OR ') + ')';
      keywords.forEach(kw => params.push(`%${kw}%`));
    }
    query += ` LIMIT ${maxResults}`;
    return this.db.prepare(query).all(...params);
  }

  searchSymbols(name, type = null, repos = []) {
    let query = 'SELECT name, type, file, line FROM symbols WHERE name = ?';
    const params = [name];
    if (type) { query += ' AND type = ?'; params.push(type); }
    return this.db.prepare(query).all(...params);
  }

  traceCalls(symbol, direction = 'both', maxDepth = 3) {
    const visited = new Set();
    const results = [];
    const stmtCallers = this.db.prepare('SELECT DISTINCT caller, file, line FROM calls WHERE callee = ?');
    const stmtCallees = this.db.prepare('SELECT DISTINCT callee, file, line FROM calls WHERE caller = ?');

    const traverse = (sym, depth, dir) => {
      if (depth > maxDepth || visited.has(sym)) return;
      visited.add(sym);
      if (dir === 'callers' || dir === 'both') {
        stmtCallers.all(sym).forEach(c => {
          results.push({ from: c.caller, to: sym, file: c.file, line: c.line, direction: 'caller' });
          traverse(c.caller, depth + 1, 'callers');
        });
      }
      if (dir === 'callees' || dir === 'both') {
        stmtCallees.all(sym).forEach(c => {
          results.push({ from: sym, to: c.callee, file: c.file, line: c.line, direction: 'callee' });
          traverse(c.callee, depth + 1, 'callees');
        });
      }
    };
    traverse(symbol, 0, direction);
    return results;
  }

  analyzeImpact(files, symbols = []) {
    const affectedFiles = new Set(files);
    const affectedSymbols = new Set(symbols);
    const stmtSyms = this.db.prepare('SELECT DISTINCT name FROM symbols WHERE file = ?');
    const stmtFiles = this.db.prepare('SELECT DISTINCT file FROM calls WHERE callee = ?');

    files.forEach(f => stmtSyms.all(f).forEach(s => affectedSymbols.add(s.name)));
    affectedSymbols.forEach(s => stmtFiles.all(s).forEach(c => affectedFiles.add(c.file)));

    return {
      affectedFiles: Array.from(affectedFiles),
      affectedSymbols: Array.from(affectedSymbols),
      riskLevel: affectedSymbols.size > 10 ? 'high' : affectedSymbols.size > 5 ? 'medium' : 'low',
    };
  }

  computeBlastRadius(files, symbols = []) { return this.analyzeImpact(files, symbols); }

  findHubNodes(topN = 10) {
    return this.db.prepare('SELECT callee as name, COUNT(*) as count FROM calls GROUP BY callee ORDER BY count DESC LIMIT ?').all(topN);
  }

  findBridgeNodes(topN = 10) {
    return this.db.prepare('SELECT caller as name, COUNT(DISTINCT callee) as fanout FROM calls GROUP BY caller ORDER BY fanout DESC LIMIT ?').all(topN);
  }

  close() { this.db.close(); }
}

module.exports = { IndexBuilder };
