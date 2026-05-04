const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const Parser = require('tree-sitter');
const C = require('tree-sitter-c');
const Cpp = require('tree-sitter-cpp');
const TypeScript = require('tree-sitter-typescript');
const Python = require('tree-sitter-python');

class IndexBuilder {
  constructor(dbPath) {
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
    parsers.ts = new Parser();
    parsers.ts.setLanguage(TypeScript.typescript);
    parsers.tsx = new Parser();
    parsers.tsx.setLanguage(TypeScript.tsx);
    parsers.py = new Parser();
    parsers.py.setLanguage(Python);
    return parsers;
  }

  _initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        hash TEXT NOT NULL,
        language TEXT,
        indexed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY,
        file_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        start_line INTEGER,
        end_line INTEGER,
        hash TEXT,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS symbol_refs (
        id INTEGER PRIMARY KEY,
        symbol_id INTEGER NOT NULL,
        file_id INTEGER NOT NULL,
        line INTEGER,
        type TEXT,
        FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS calls (
        id INTEGER PRIMARY KEY,
        caller_id INTEGER NOT NULL,
        callee_name TEXT NOT NULL,
        file_id INTEGER NOT NULL,
        line INTEGER,
        FOREIGN KEY (caller_id) REFERENCES symbols(id) ON DELETE CASCADE,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS dependencies (
        id INTEGER PRIMARY KEY,
        file_id INTEGER NOT NULL,
        dep_path TEXT NOT NULL,
        type TEXT,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
      CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee_name);
      CREATE INDEX IF NOT EXISTS idx_deps_path ON dependencies(dep_path);
    `);
  }

  _getParser(filePath) {
    const ext = path.extname(filePath).slice(1);
    const map = { c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', ts: 'ts', tsx: 'tsx', py: 'py' };
    return this.parsers[map[ext]];
  }

  _computeHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  indexFile(filePath, repoRoot = '') {
    const content = fs.readFileSync(filePath, 'utf8');
    const hash = this._computeHash(content);
    const relativePath = repoRoot ? path.relative(repoRoot, filePath) : filePath;

    const existing = this.db.prepare('SELECT id, hash FROM files WHERE path = ?').get(relativePath);
    if (existing && existing.hash === hash) {
      return { updated: false, fileId: existing.id };
    }

    const parser = this._getParser(filePath);
    if (!parser) {
      return { updated: false, error: 'Unsupported file type' };
    }

    const tree = parser.parse(content);
    const ext = path.extname(filePath).slice(1);
    const language = { c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', ts: 'typescript', tsx: 'typescript', py: 'python' }[ext];

    this.db.transaction(() => {
      if (existing) {
        this.db.prepare('DELETE FROM symbols WHERE file_id = ?').run(existing.id);
        this.db.prepare('DELETE FROM calls WHERE file_id = ?').run(existing.id);
        this.db.prepare('DELETE FROM dependencies WHERE file_id = ?').run(existing.id);
        this.db.prepare('UPDATE files SET hash = ?, language = ?, indexed_at = ? WHERE id = ?')
          .run(hash, language, Date.now(), existing.id);
      } else {
        this.db.prepare('INSERT INTO files (path, hash, language, indexed_at) VALUES (?, ?, ?, ?)')
          .run(relativePath, hash, language, Date.now());
      }
    })();

    const fileId = existing ? existing.id : this.db.prepare('SELECT id FROM files WHERE path = ?').get(relativePath).id;
    this._extractSymbols(tree.rootNode, fileId, content);
    this._extractDependencies(tree.rootNode, fileId, content);

    return { updated: true, fileId };
  }

  _extractSymbols(node, fileId, content) {
    const calls = [];
    const traverse = (n, parentSymbolId = null) => {
      const type = n.type;
      let symbolType = null;

      if (type === 'function_definition' || type === 'function_declarator' || type === 'function_declaration') {
        symbolType = 'function';
      } else if (type === 'class_declaration' || type === 'class_specifier') {
        symbolType = 'class';
      } else if (type === 'method_definition') {
        symbolType = 'method';
      }

      if (symbolType) {
        const nameNode = this._findNameNode(n);
        if (nameNode) {
          const name = content.slice(nameNode.startIndex, nameNode.endIndex);
          const symbolHash = this._computeHash(content.slice(n.startIndex, n.endIndex));
          const symbolId = this.db.prepare(
            'INSERT INTO symbols (file_id, name, type, start_line, end_line, hash) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(fileId, name, symbolType, n.startPosition.row + 1, n.endPosition.row + 1, symbolHash).lastInsertRowid;
          parentSymbolId = symbolId;
        }
      }

      if (type === 'call_expression' && parentSymbolId) {
        const calleeNode = n.childForFieldName('function');
        if (calleeNode) {
          const calleeName = content.slice(calleeNode.startIndex, calleeNode.endIndex);
          calls.push({ callerId: parentSymbolId, calleeName, line: n.startPosition.row + 1 });
        }
      }

      for (let child of n.children) {
        traverse(child, parentSymbolId);
      }
    };

    traverse(node);
    const insertCall = this.db.prepare('INSERT INTO calls (caller_id, callee_name, file_id, line) VALUES (?, ?, ?, ?)');
    for (let call of calls) {
      insertCall.run(call.callerId, call.calleeName, fileId, call.line);
    }
  }

  _findNameNode(node) {
    const nameField = node.childForFieldName('name') || node.childForFieldName('declarator');
    if (nameField) {
      if (nameField.type === 'identifier') return nameField;
      return this._findNameNode(nameField);
    }
    for (let child of node.children) {
      if (child.type === 'identifier') return child;
    }
    return null;
  }

  _extractDependencies(node, fileId, content) {
    const deps = [];
    const traverse = (n) => {
      if (n.type === 'preproc_include') {
        const pathNode = n.childForFieldName('path');
        if (pathNode) {
          const depPath = content.slice(pathNode.startIndex, pathNode.endIndex).replace(/[<>"]/g, '');
          deps.push({ path: depPath, type: 'include' });
        }
      } else if (n.type === 'import_statement' || n.type === 'import_from_statement') {
        const moduleNode = n.childForFieldName('module_name') || n.childForFieldName('name');
        if (moduleNode) {
          const depPath = content.slice(moduleNode.startIndex, moduleNode.endIndex);
          deps.push({ path: depPath, type: 'import' });
        }
      }
      for (let child of n.children) {
        traverse(child);
      }
    };

    traverse(node);
    const insertDep = this.db.prepare('INSERT INTO dependencies (file_id, dep_path, type) VALUES (?, ?, ?)');
    for (let dep of deps) {
      insertDep.run(fileId, dep.path, dep.type);
    }
  }

  searchFiles(pattern) {
    return this.db.prepare('SELECT * FROM files WHERE path LIKE ?').all(`%${pattern}%`);
  }

  searchSymbols(name, type = null) {
    if (type) {
      return this.db.prepare('SELECT s.*, f.path FROM symbols s JOIN files f ON s.file_id = f.id WHERE s.name LIKE ? AND s.type = ?')
        .all(`%${name}%`, type);
    }
    return this.db.prepare('SELECT s.*, f.path FROM symbols s JOIN files f ON s.file_id = f.id WHERE s.name LIKE ?')
      .all(`%${name}%`);
  }

  traceCalls(symbolName, maxDepth = 5) {
    const result = { symbol: symbolName, callers: [], callees: [] };
    const visited = new Set();

    const findCallers = (name, depth) => {
      if (depth > maxDepth || visited.has(name)) return [];
      visited.add(name);
      const callers = this.db.prepare(`
        SELECT DISTINCT s.name, s.type, f.path, c.line
        FROM calls c
        JOIN symbols s ON c.caller_id = s.id
        JOIN files f ON s.file_id = f.id
        WHERE c.callee_name = ?
      `).all(name);
      return callers.map(c => ({ ...c, callers: findCallers(c.name, depth + 1) }));
    };

    const findCallees = (name, depth) => {
      if (depth > maxDepth) return [];
      const symbol = this.db.prepare('SELECT id FROM symbols WHERE name = ?').get(name);
      if (!symbol) return [];
      const callees = this.db.prepare(`
        SELECT DISTINCT c.callee_name, c.line, f.path
        FROM calls c
        JOIN files f ON c.file_id = f.id
        WHERE c.caller_id = ?
      `).all(symbol.id);
      return callees.map(c => ({ name: c.callee_name, line: c.line, path: c.path, callees: findCallees(c.callee_name, depth + 1) }));
    };

    result.callers = findCallers(symbolName, 0);
    result.callees = findCallees(symbolName, 0);
    return result;
  }

  analyzeImpact(filePaths) {
    const fileIds = filePaths.map(p => {
      const f = this.db.prepare('SELECT id FROM files WHERE path = ?').get(p);
      return f ? f.id : null;
    }).filter(id => id !== null);

    if (fileIds.length === 0) return { files: [], symbols: [], callers: [] };

    const symbols = this.db.prepare(`
      SELECT s.*, f.path FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE s.file_id IN (${fileIds.map(() => '?').join(',')})
    `).all(...fileIds);

    const callers = [];
    for (let sym of symbols) {
      const symCallers = this.db.prepare(`
        SELECT DISTINCT s.name, s.type, f.path, c.line
        FROM calls c
        JOIN symbols s ON c.caller_id = s.id
        JOIN files f ON s.file_id = f.id
        WHERE c.callee_name = ?
      `).all(sym.name);
      callers.push(...symCallers);
    }

    const affectedFiles = this.db.prepare(`
      SELECT DISTINCT f.* FROM files f
      JOIN dependencies d ON d.file_id = f.id
      WHERE d.dep_path IN (${fileIds.map(() => '(SELECT path FROM files WHERE id = ?)').join(',')})
    `).all(...fileIds);

    return { files: affectedFiles, symbols, callers };
  }

  computeBlastRadius(symbolName) {
    const visited = new Set();
    const radius = { direct: 0, indirect: 0, files: new Set() };

    const traverse = (name, depth) => {
      if (visited.has(name)) return;
      visited.add(name);

      const callers = this.db.prepare(`
        SELECT DISTINCT s.name, f.path, f.id
        FROM calls c
        JOIN symbols s ON c.caller_id = s.id
        JOIN files f ON s.file_id = f.id
        WHERE c.callee_name = ?
      `).all(name);

      for (let caller of callers) {
        if (depth === 0) radius.direct++;
        else radius.indirect++;
        radius.files.add(caller.path);
        traverse(caller.name, depth + 1);
      }
    };

    traverse(symbolName, 0);
    return { ...radius, files: Array.from(radius.files) };
  }

  findHubNodes(minConnections = 5) {
    const hubs = this.db.prepare(`
      SELECT s.name, s.type, f.path, COUNT(DISTINCT c.caller_id) as caller_count
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      LEFT JOIN calls c ON c.callee_name = s.name
      GROUP BY s.id
      HAVING caller_count >= ?
      ORDER BY caller_count DESC
    `).all(minConnections);
    return hubs;
  }

  findBridgeNodes() {
    const symbols = this.db.prepare('SELECT id, name FROM symbols').all();
    const bridges = [];

    for (let sym of symbols) {
      const callers = this.db.prepare('SELECT DISTINCT caller_id FROM calls WHERE callee_name = ?').all(sym.name);
      const callees = this.db.prepare('SELECT DISTINCT callee_name FROM calls WHERE caller_id = ?').all(sym.id);

      if (callers.length > 0 && callees.length > 0) {
        const callerFiles = new Set(callers.map(c => {
          const s = this.db.prepare('SELECT file_id FROM symbols WHERE id = ?').get(c.caller_id);
          return s ? s.file_id : null;
        }).filter(f => f !== null));

        const calleeFiles = new Set();
        for (let callee of callees) {
          const syms = this.db.prepare('SELECT file_id FROM symbols WHERE name = ?').all(callee.callee_name);
          syms.forEach(s => calleeFiles.add(s.file_id));
        }

        const intersection = [...callerFiles].filter(f => !calleeFiles.has(f));
        if (intersection.length > 0 && callerFiles.size > 1 && calleeFiles.size > 1) {
          bridges.push({ name: sym.name, callerCount: callerFiles.size, calleeCount: calleeFiles.size });
        }
      }
    }

    return bridges.sort((a, b) => (b.callerCount + b.calleeCount) - (a.callerCount + a.calleeCount));
  }

  close() {
    this.db.close();
  }
}

module.exports = IndexBuilder;




