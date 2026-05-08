const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const Database = require('better-sqlite3');
const { parseBuildSystem } = require('./makefile-parser.js');

// worker 线程入口：接收文件路径，返回解析结果，不碰 SQLite
if (!isMainThread) {
  const Parser = require('tree-sitter');
  const C = require('tree-sitter-c');
  const Cpp = require('tree-sitter-cpp');
  const TypeScript = require('tree-sitter-typescript').typescript;
  const TSX = require('tree-sitter-typescript').tsx;
  const Python = require('tree-sitter-python');

  const make = (lang) => { const p = new Parser(); p.setLanguage(lang); return p; };
  const parsers = {
    c: make(C), cpp: make(Cpp),
    typescript: make(TypeScript), tsx: make(TSX),
    python: make(Python),
  };

  const EXT_LANG = workerData.EXT_LANG;
  const MAX_FILE_SIZE = workerData.MAX_FILE_SIZE;

  const SYMBOL_TYPES = {
    function_definition: 'function', function_declaration: 'function',
    method_definition: 'method', class_declaration: 'class',
    class_definition: 'class', function_item: 'function',
  };

  function extractSymbols(rootNode, content) {
    const results = [];
    const stack = [rootNode];
    while (stack.length > 0) {
      const node = stack.pop();
      const symType = SYMBOL_TYPES[node.type];
      if (symType) {
        const nameNode = node.childForFieldName('name') || node.childForFieldName('declarator');
        if (nameNode) results.push({ name: content.substring(nameNode.startIndex, nameNode.endIndex), type: symType, line: node.startPosition.row + 1 });
      }
      for (const child of node.children) stack.push(child);
    }
    return results;
  }

  function findEnclosingFunction(node, content) {
    let cur = node.parent;
    while (cur) {
      if (cur.type === 'function_definition' || cur.type === 'method_definition') {
        const n = cur.childForFieldName('name') || cur.childForFieldName('declarator');
        if (n) return content.substring(n.startIndex, n.endIndex);
      }
      cur = cur.parent;
    }
    return null;
  }

  function extractCalls(rootNode, content) {
    const results = [];
    const stack = [rootNode];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node.type === 'call_expression') {
        const funcNode = node.childForFieldName('function');
        if (funcNode) {
          const callee = content.substring(funcNode.startIndex, funcNode.endIndex);
          const caller = findEnclosingFunction(node, content);
          if (caller) results.push({ caller, callee, line: node.startPosition.row + 1 });
        }
      }
      for (const child of node.children) stack.push(child);
    }
    return results;
  }

  function parseFile(filePath, repoRoot) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) return { status: 'skipped', reason: 'too_large' };

      const lang = EXT_LANG[path.extname(filePath)];
      const parser = parsers[lang];
      if (!parser) return { status: 'skipped', reason: 'no_parser' };

      const raw = fs.readFileSync(filePath);
      if (raw.slice(0, 8192).indexOf(0) !== -1) return { status: 'skipped', reason: 'binary' };

      const content = raw.toString('utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const relPath = path.relative(repoRoot, filePath);

      const tree = parser.parse(content);
      if (!tree?.rootNode) return { status: 'skipped', reason: 'parse_failed' };

      return {
        status: 'ok',
        relPath,
        hash,
        lang,
        symbols: extractSymbols(tree.rootNode, content),
        calls: extractCalls(tree.rootNode, content),
      };
    } catch (err) {
      return { status: 'error', reason: err.message };
    }
  }

  parentPort.on('message', ({ batch, repoRoot }) => {
    const results = batch.map(filePath => ({ filePath, ...parseFile(filePath, repoRoot) }));
    parentPort.postMessage(results);
  });

  return; // worker 线程到此结束，不执行下面的主线程代码
}

// ── 主线程 ──────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.svn', '.hg',
  'build', 'dist', 'out', 'output', 'target',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.tox',
  'vendor', 'third_party', 'third-party', 'thirdparty',
  '.cache', '.tmp', 'tmp', 'temp',
  'coverage', '.nyc_output',
  'CMakeFiles', '.cmake',
]);

const SOURCE_EXTS = new Set(['.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.ts', '.tsx', '.js', '.jsx', '.py']);

const EXT_LANG = {
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.ts': 'typescript', '.tsx': 'tsx',
  '.js': 'typescript', '.jsx': 'tsx',
  '.py': 'python',
};

const MAX_FILE_SIZE = 512 * 1024;
const WORKER_BATCH = 50; // 每个 worker 每次处理的文件数

class IndexBuilder {
  constructor(dbPath) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -32000');
    this.db.pragma('temp_store = MEMORY');

    this._initSchema();
    this._prepareStmts();
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        language TEXT NOT NULL,
        compiled INTEGER NOT NULL DEFAULT 1,
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
    // 迁移：旧表没有 compiled 列时补上
    const cols = this.db.prepare("PRAGMA table_info(files)").all().map(r => r.name);
    if (!cols.includes('compiled')) this.db.exec('ALTER TABLE files ADD COLUMN compiled INTEGER NOT NULL DEFAULT 1');
  }

  _prepareStmts() {
    this.stmts = {
      getFile:    this.db.prepare('SELECT hash FROM files WHERE path = ?'),
      upsertFile: this.db.prepare('INSERT OR REPLACE INTO files (path, hash, language, compiled, indexed_at) VALUES (?, ?, ?, ?, ?)'),
      delSymbols: this.db.prepare('DELETE FROM symbols WHERE file = ?'),
      delCalls:   this.db.prepare('DELETE FROM calls WHERE file = ?'),
      insSymbol:  this.db.prepare('INSERT INTO symbols (name, type, file, line) VALUES (?, ?, ?, ?)'),
      insCall:    this.db.prepare('INSERT INTO calls (caller, callee, file, line) VALUES (?, ?, ?, ?)'),
    };
  }

  computeHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  collectFiles(dirPath) {
    const result = [];
    const queue = [dirPath];
    while (queue.length > 0) {
      const cur = queue.pop();
      let entries;
      try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
      catch { continue; }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
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

  // 主入口：多核并行解析，主线程批量写 SQLite
  async indexDirectory(dirPath, repoRoot = '') {
    const root = path.resolve(repoRoot || dirPath);

    // 解析构建系统，获取参与编译的文件集合
    const buildInfo = parseBuildSystem(root);
    if (buildInfo) {
      process.stderr.write(`[index-builder] build system: ${buildInfo.buildSystem} (confidence: ${buildInfo.confidence}), ${buildInfo.compiled.size} compiled files\n`);
    } else {
      process.stderr.write(`[index-builder] no build system found, indexing all source files\n`);
    }

    const allFiles = this.collectFiles(dirPath);
    process.stderr.write(`[index-builder] found ${allFiles.size || allFiles.length} source files\n`);

    const numWorkers = Math.max(1, Math.min(os.cpus().length - 1, 8));
    process.stderr.write(`[index-builder] using ${numWorkers} worker threads\n`);

    // 把文件列表切成 numWorkers 份，每份再按 WORKER_BATCH 分批
    const workerFiles = Array.from({ length: numWorkers }, () => []);
    allFiles.forEach((f, i) => workerFiles[i % numWorkers].push(f));

    let indexed = 0, skipped = 0, notCompiled = 0;
    const now = Date.now();

    // 批量写入事务
    const writeBatch = this.db.transaction((results) => {
      for (const r of results) {
        if (r.status !== 'ok') { skipped++; continue; }

        const isCompiled = buildInfo ? (buildInfo.compiled.has(path.resolve(dirPath, r.relPath)) ? 1 : 0) : 1;
        if (!isCompiled) notCompiled++;

        const existing = this.stmts.getFile.get(r.relPath);
        if (existing?.hash === r.hash) { skipped++; continue; }

        this.stmts.delSymbols.run(r.relPath);
        this.stmts.delCalls.run(r.relPath);
        this.stmts.upsertFile.run(r.relPath, r.hash, r.lang, isCompiled, now);

        // 未参与编译的文件：记录路径但不索引符号和调用链
        if (isCompiled) {
          for (const s of r.symbols) this.stmts.insSymbol.run(s.name, s.type, r.relPath, s.line);
          for (const c of r.calls) this.stmts.insCall.run(c.caller, c.callee, r.relPath, c.line);
        }
        indexed++;
      }
    });

    // 启动 workers，收集结果后批量写入
    await Promise.all(workerFiles.map((files, wi) => new Promise((resolve, reject) => {
      if (files.length === 0) { resolve(); return; }

      const worker = new Worker(__filename, {
        workerData: { isWorker: true, EXT_LANG, MAX_FILE_SIZE },
      });

      let pending = 0;
      let cursor = 0;

      const sendNext = () => {
        if (cursor >= files.length) {
          if (pending === 0) { worker.terminate(); resolve(); }
          return;
        }
        const batch = files.slice(cursor, cursor + WORKER_BATCH);
        cursor += WORKER_BATCH;
        pending++;
        worker.postMessage({ batch, repoRoot: root });
      };

      worker.on('message', (results) => {
        writeBatch(results);
        pending--;
        const done = indexed + skipped + notCompiled;
        if (done % 5000 < WORKER_BATCH * numWorkers) {
          process.stderr.write(`[index-builder] progress: ~${done}/${allFiles.length}\n`);
        }
        sendNext();
      });

      worker.on('error', reject);

      // 初始发送，让 worker 保持忙碌（pipeline：发 2 批，收 1 批时再发 1 批）
      sendNext();
      sendNext();
    })));

    process.stderr.write(`[index-builder] done: ${indexed} indexed, ${notCompiled} not-compiled (symbols skipped), ${skipped} unchanged/skipped\n`);
    return { total: allFiles.length, indexed, notCompiled, skipped };
  }

  // 兼容旧的同步接口（单文件，不走 worker）
  indexFile(filePath, repoRoot = '') {
    const root = path.resolve(repoRoot || path.dirname(filePath));
    this.db.transaction(() => {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_FILE_SIZE) return;
        const lang = EXT_LANG[path.extname(filePath)];
        if (!lang) return;
        const raw = fs.readFileSync(filePath);
        if (raw.slice(0, 8192).indexOf(0) !== -1) return;
        const content = raw.toString('utf8');
        const hash = this.computeHash(content);
        const relPath = path.relative(root, filePath);
        const existing = this.stmts.getFile.get(relPath);
        if (existing?.hash === hash) return;

        // 单文件模式：在主线程直接 parse（不启 worker）
        const Parser = require('tree-sitter');
        if (!this._parsers) {
          const C = require('tree-sitter-c'), Cpp = require('tree-sitter-cpp');
          const TS = require('tree-sitter-typescript');
          const Py = require('tree-sitter-python');
          const mk = (l) => { const p = new Parser(); p.setLanguage(l); return p; };
          this._parsers = { c: mk(C), cpp: mk(Cpp), typescript: mk(TS.typescript), tsx: mk(TS.tsx), python: mk(Py) };
        }
        const parser = this._parsers[lang];
        if (!parser) return;
        const tree = parser.parse(content);
        if (!tree?.rootNode) return;

        this.stmts.delSymbols.run(relPath);
        this.stmts.delCalls.run(relPath);
        this.stmts.upsertFile.run(relPath, hash, lang, 1, Date.now());

        const SYMBOL_TYPES = { function_definition:'function', function_declaration:'function', method_definition:'method', class_declaration:'class', class_definition:'class', function_item:'function' };
        const stack = [tree.rootNode];
        while (stack.length) {
          const node = stack.pop();
          const st = SYMBOL_TYPES[node.type];
          if (st) { const n = node.childForFieldName('name') || node.childForFieldName('declarator'); if (n) this.stmts.insSymbol.run(content.substring(n.startIndex, n.endIndex), st, relPath, node.startPosition.row + 1); }
          for (const c of node.children) stack.push(c);
        }
      } catch (err) {
        process.stderr.write(`[index-builder] skip ${filePath}: ${err.message}\n`);
      }
    })();
  }

  detectLanguage(filePath) { return EXT_LANG[path.extname(filePath)] || 'unknown'; }

  searchFiles(keywords, repos = [], language = null, maxResults = 50) {
    let query = 'SELECT path, language, compiled FROM files WHERE 1=1';
    const params = [];
    if (language) { query += ' AND language = ?'; params.push(language); }
    if (keywords.length > 0) {
      query += ' AND (' + keywords.map(() => 'path LIKE ?').join(' OR ') + ')';
      keywords.forEach(kw => params.push(`%${kw}%`));
    }
    query += ` LIMIT ${maxResults}`;
    return this.db.prepare(query).all(...params);
  }

  // compiled_only: true 时只搜索参与编译的文件里的符号，避免误判
  searchSymbols(name, type = null, repos = [], compiledOnly = true) {
    let query = compiledOnly
      ? 'SELECT s.name, s.type, s.file, s.line FROM symbols s JOIN files f ON s.file = f.path WHERE s.name = ? AND f.compiled = 1'
      : 'SELECT name, type, file, line FROM symbols WHERE name = ?';
    const params = [name];
    if (type) { query += ' AND s.type = ?'; params.push(type); }
    return this.db.prepare(query).all(...params);
  }

  traceCalls(symbol, direction = 'both', maxDepth = 3) {
    const visited = new Set();
    const results = [];
    const stmtCallers = this.db.prepare('SELECT DISTINCT c.caller, c.file, c.line FROM calls c JOIN files f ON c.file = f.path WHERE c.callee = ? AND f.compiled = 1');
    const stmtCallees = this.db.prepare('SELECT DISTINCT c.callee, c.file, c.line FROM calls c JOIN files f ON c.file = f.path WHERE c.caller = ? AND f.compiled = 1');

    const traverse = (sym, depth, dir) => {
      if (depth > maxDepth || visited.has(sym)) return;
      visited.add(sym);
      if (dir === 'callers' || dir === 'both') {
        stmtCallers.all(sym).forEach(c => { results.push({ from: c.caller, to: sym, file: c.file, line: c.line, direction: 'caller' }); traverse(c.caller, depth + 1, 'callers'); });
      }
      if (dir === 'callees' || dir === 'both') {
        stmtCallees.all(sym).forEach(c => { results.push({ from: sym, to: c.callee, file: c.file, line: c.line, direction: 'callee' }); traverse(c.callee, depth + 1, 'callees'); });
      }
    };
    traverse(symbol, 0, direction);
    return results;
  }

  analyzeImpact(files, symbols = []) {
    const affectedFiles = new Set(files);
    const affectedSymbols = new Set(symbols);
    const stmtSyms  = this.db.prepare('SELECT DISTINCT name FROM symbols WHERE file = ?');
    const stmtFiles = this.db.prepare('SELECT DISTINCT c.file FROM calls c JOIN files f ON c.file = f.path WHERE c.callee = ? AND f.compiled = 1');

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
    return this.db.prepare('SELECT c.callee as name, COUNT(*) as count FROM calls c JOIN files f ON c.file = f.path WHERE f.compiled = 1 GROUP BY c.callee ORDER BY count DESC LIMIT ?').all(topN);
  }

  findBridgeNodes(topN = 10) {
    return this.db.prepare('SELECT c.caller as name, COUNT(DISTINCT c.callee) as fanout FROM calls c JOIN files f ON c.file = f.path WHERE f.compiled = 1 GROUP BY c.caller ORDER BY fanout DESC LIMIT ?').all(topN);
  }

  close() { this.db.close(); }
}

module.exports = { IndexBuilder };
