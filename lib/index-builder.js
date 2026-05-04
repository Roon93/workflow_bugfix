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

class IndexBuilder {
  constructor(dbPath) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.parsers = this._initParsers();
    this._initSchema();
  }

  _initParsers() {
    const parsers = {};
    parsers.c = new Parser();
    parsers.c.setLanguage(C);
    parsers.cpp = new Parser();
    parsers.cpp.setLanguage(Cpp);
    parsers.typescript = new Parser();
    parsers.typescript.setLanguage(TypeScript);
    parsers.tsx = new Parser();
    parsers.tsx.setLanguage(TSX);
    parsers.python = new Parser();
    parsers.python.setLanguage(Python);
    return parsers;
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
        line INTEGER NOT NULL,
        FOREIGN KEY (file) REFERENCES files(path)
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

  computeHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  indexFile(filePath, repoRoot = '') {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const hash = this.computeHash(content);
    const relPath = path.relative(repoRoot || '.', filePath);
    const language = this.detectLanguage(filePath);

    const existing = this.db.prepare('SELECT hash FROM files WHERE path = ?').get(relPath);
    if (existing?.hash === hash) return;

    const parser = this.parsers[language];
    if (!parser) return;

    const tree = parser.parse(content);

    this.db.prepare('DELETE FROM symbols WHERE file = ?').run(relPath);
    this.db.prepare('DELETE FROM calls WHERE file = ?').run(relPath);
    this.db.prepare('INSERT OR REPLACE INTO files (path, hash, language, indexed_at) VALUES (?, ?, ?, ?)').run(relPath, hash, language, Date.now());

    this._extractSymbols(tree.rootNode, relPath, content);
    this._extractCalls(tree.rootNode, relPath, content);
  }

  indexDirectory(dirPath, repoRoot = '') {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) {
        this.indexDirectory(fullPath, repoRoot);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (['.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.ts', '.tsx', '.js', '.jsx', '.py'].includes(ext)) {
          this.indexFile(fullPath, repoRoot);
        }
      }
    }
  }

  detectLanguage(filePath) {
    const ext = path.extname(filePath);
    const langMap = {
      '.c': 'c', '.h': 'c',
      '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
      '.ts': 'typescript', '.tsx': 'tsx',
      '.js': 'typescript', '.jsx': 'tsx',
      '.py': 'python'
    };
    return langMap[ext] || 'unknown';
  }

  _extractSymbols(node, filePath, content) {
    const symbolTypes = {
      function_definition: 'function',
      function_declaration: 'function',
      method_definition: 'method',
      class_declaration: 'class',
      class_definition: 'class',
      function_item: 'function',
      class_definition: 'class'
    };

    if (symbolTypes[node.type]) {
      const nameNode = node.childForFieldName('name') || node.childForFieldName('declarator');
      if (nameNode) {
        const name = content.substring(nameNode.startIndex, nameNode.endIndex);
        this.db.prepare('INSERT INTO symbols (name, type, file, line) VALUES (?, ?, ?, ?)').run(name, symbolTypes[node.type], filePath, node.startPosition.row + 1);
      }
    }

    for (const child of node.children) {
      this._extractSymbols(child, filePath, content);
    }
  }

  _extractCalls(node, filePath, content) {
    if (node.type === 'call_expression') {
      const funcNode = node.childForFieldName('function');
      if (funcNode) {
        const callee = content.substring(funcNode.startIndex, funcNode.endIndex);
        const caller = this._findEnclosingFunction(node, content);
        if (caller) {
          this.db.prepare('INSERT INTO calls (caller, callee, file, line) VALUES (?, ?, ?, ?)').run(caller, callee, filePath, node.startPosition.row + 1);
        }
      }
    }

    for (const child of node.children) {
      this._extractCalls(child, filePath, content);
    }
  }

  _findEnclosingFunction(node, content) {
    let current = node.parent;
    while (current) {
      if (current.type === 'function_definition' || current.type === 'method_definition') {
        const nameNode = current.childForFieldName('name') || current.childForFieldName('declarator');
        if (nameNode) {
          return content.substring(nameNode.startIndex, nameNode.endIndex);
        }
      }
      current = current.parent;
    }
    return null;
  }

  searchFiles(keywords, repos = [], language = null, maxResults = 50) {
    let query = 'SELECT path, language FROM files WHERE 1=1';
    const params = [];

    if (language) {
      query += ' AND language = ?';
      params.push(language);
    }

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
    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }
    return this.db.prepare(query).all(...params);
  }

  traceCalls(symbol, direction = 'both', maxDepth = 3) {
    const visited = new Set();
    const results = [];

    const traverse = (sym, depth, dir) => {
      if (depth > maxDepth || visited.has(sym)) return;
      visited.add(sym);

      if (dir === 'callers' || dir === 'both') {
        const callers = this.db.prepare('SELECT DISTINCT caller, file, line FROM calls WHERE callee = ?').all(sym);
        callers.forEach(c => {
          results.push({ from: c.caller, to: sym, file: c.file, line: c.line, direction: 'caller' });
          traverse(c.caller, depth + 1, 'callers');
        });
      }

      if (dir === 'callees' || dir === 'both') {
        const callees = this.db.prepare('SELECT DISTINCT callee, file, line FROM calls WHERE caller = ?').all(sym);
        callees.forEach(c => {
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

    files.forEach(file => {
      const syms = this.db.prepare('SELECT DISTINCT name FROM symbols WHERE file = ?').all(file);
      syms.forEach(s => affectedSymbols.add(s.name));
    });

    affectedSymbols.forEach(sym => {
      const calls = this.db.prepare('SELECT DISTINCT file FROM calls WHERE callee = ?').all(sym);
      calls.forEach(c => affectedFiles.add(c.file));
    });

    return {
      affectedFiles: Array.from(affectedFiles),
      affectedSymbols: Array.from(affectedSymbols),
      riskLevel: affectedSymbols.size > 10 ? 'high' : affectedSymbols.size > 5 ? 'medium' : 'low'
    };
  }

  computeBlastRadius(files, symbols = []) {
    return this.analyzeImpact(files, symbols);
  }

  findHubNodes(topN = 10) {
    return this.db.prepare(`
      SELECT callee as name, COUNT(*) as count
      FROM calls
      GROUP BY callee
      ORDER BY count DESC
      LIMIT ?
    `).all(topN);
  }

  findBridgeNodes(topN = 10) {
    return this.db.prepare(`
      SELECT caller as name, COUNT(DISTINCT callee) as fanout
      FROM calls
      GROUP BY caller
      ORDER BY fanout DESC
      LIMIT ?
    `).all(topN);
  }

  close() {
    this.db.close();
  }
}

module.exports = { IndexBuilder };
