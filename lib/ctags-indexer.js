const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// kind → symbol type 映射
const KIND_MAP = {
  function: 'function', prototype: 'function', method: 'method',
  class: 'class', struct: 'class', union: 'class', interface: 'class',
};

class CtagsIndexer {
  constructor(db, stmts) {
    this.db = db;
    this.stmts = stmts;
  }

  // 主入口：ctags 或 ctags+cscope 索引
  async indexDirectory(dirPath, repoRoot, cfg) {
    const ctagsBin = cfg.ctagsBin || 'ctags';
    const useCscope = cfg.indexer === 'ctags+cscope';
    const cscopeBin = cfg.cscopeBin || 'cscope';

    // 1. 运行 ctags，收集 symbols 和 files
    const { symbols, files } = this._runCtags(dirPath, repoRoot, ctagsBin, cfg);

    // 2. 写入 DB（事务）
    const now = Date.now();
    const writeSymbols = this.db.transaction(() => {
      for (const [relPath, fileSyms] of files) {
        this.stmts.delSymbols.run(relPath);
        this.stmts.delCalls.run(relPath);
        this.stmts.upsertFile.run(relPath, '', 'c', 1, now);
        for (const s of fileSyms) {
          this.stmts.insSymbol.run(s.name, s.type, relPath, s.line);
        }
      }
    });
    writeSymbols();

    // 3. 可选：cscope 建库并查询 calls
    if (useCscope) {
      this._runCscope(dirPath, repoRoot, cscopeBin, symbols);
    }

    return { total: files.size, indexed: files.size, notCompiled: 0, skipped: 0 };
  }

  _runCtags(dirPath, repoRoot, ctagsBin, cfg) {
    const args = [
      '--output-format=json',
      '--fields=+n',
      '-R',
      '--languages=C,C++,Python,JavaScript,TypeScript',
      '-f', '-',
      dirPath,
    ];

    const result = spawnSync(ctagsBin, args, { maxBuffer: 256 * 1024 * 1024 });

    if (result.error) {
      throw new Error(`ctags 启动失败: ${result.error.message}`);
    }
    if (result.status !== 0 && !result.stdout?.length) {
      const stderr = result.stderr?.toString() || '';
      throw new Error(`ctags 执行失败 (exit ${result.status}): ${stderr.slice(0, 200)}`);
    }

    const files = new Map();   // relPath → symbol[]
    const symbols = [];        // { name, relPath, line } for cscope queries

    const lines = (result.stdout || Buffer.alloc(0)).toString('utf8').split('\n');
    for (const line of lines) {
      if (!line.startsWith('{')) continue;
      let tag;
      try { tag = JSON.parse(line); } catch { continue; }
      if (tag._type !== 'tag') continue;

      const symType = KIND_MAP[tag.kind];
      if (!symType) continue;

      const absPath = path.isAbsolute(tag.path) ? tag.path : path.resolve(dirPath, tag.path);
      const relPath = path.relative(repoRoot, absPath);
      if (relPath.startsWith('..')) continue; // 文件在 repoRoot 外

      if (!files.has(relPath)) files.set(relPath, []);
      files.get(relPath).push({ name: tag.name, type: symType, line: tag.line || 0 });

      if (symType === 'function' || symType === 'method') {
        symbols.push({ name: tag.name, relPath });
      }
    }

    return { symbols, files };
  }

  _runCscope(dirPath, repoRoot, cscopeBin, symbols) {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cscope-'));
    try {
      const dbFile = path.join(workDir, 'cscope.out');

      // 建库（在 dirPath 下递归扫描）
      const build = spawnSync(cscopeBin, ['-b', '-R', '-q', '-f', dbFile], {
        cwd: dirPath,
        maxBuffer: 64 * 1024 * 1024,
      });
      if (build.error) throw new Error(`cscope 启动失败: ${build.error.message}`);
      if (build.status !== 0) {
        const stderr = build.stderr?.toString() || '';
        throw new Error(`cscope 建库失败 (exit ${build.status}): ${stderr.slice(0, 200)}`);
      }

      // 对每个函数符号查询 callees（-L2）
      const now = Date.now();
      const writeCalls = this.db.transaction((rows) => {
        for (const { caller, callee, relPath, line } of rows) {
          this.stmts.insCall.run(caller, callee, relPath, line);
        }
      });

      const BATCH = 50;
      for (let i = 0; i < symbols.length; i += BATCH) {
        const batch = symbols.slice(i, i + BATCH);
        const rows = [];
        for (const sym of batch) {
          const q = spawnSync(cscopeBin, ['-d', '-L2', sym.name, '-f', dbFile], {
            maxBuffer: 4 * 1024 * 1024,
          });
          if (q.status !== 0 || !q.stdout) continue;
          for (const line of q.stdout.toString('utf8').split('\n')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 3) continue;
            // cscope -L2 输出：<file> <caller_func> <line> <text>
            const [file, callerFunc, lineNo] = parts;
            const absPath = path.isAbsolute(file) ? file : path.resolve(dirPath, file);
            const relPath = path.relative(repoRoot, absPath);
            if (relPath.startsWith('..')) continue;
            rows.push({ caller: callerFunc, callee: sym.name, relPath, line: parseInt(lineNo, 10) || 0 });
          }
        }
        if (rows.length > 0) writeCalls(rows);
      }
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}

module.exports = { CtagsIndexer };
