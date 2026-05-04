const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class IndexBuilder {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.indexDir = path.dirname(dbPath);
    if (!fs.existsSync(this.indexDir)) {
      fs.mkdirSync(this.indexDir, { recursive: true });
    }
    this.index = this.loadIndex();
  }

  loadIndex() {
    if (fs.existsSync(this.dbPath)) {
      return JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
    }
    return { files: {}, symbols: {}, calls: {} };
  }

  saveIndex() {
    fs.writeFileSync(this.dbPath, JSON.stringify(this.index, null, 2));
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

    if (this.index.files[relPath]?.hash === hash) return;

    this.index.files[relPath] = {
      path: relPath,
      hash,
      language: this.detectLanguage(filePath),
      indexed_at: Date.now()
    };

    this.extractSymbols(relPath, content);
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
    this.saveIndex();
  }

  detectLanguage(filePath) {
    const ext = path.extname(filePath);
    const langMap = {
      '.c': 'c', '.h': 'c',
      '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
      '.ts': 'typescript', '.tsx': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python'
    };
    return langMap[ext] || 'unknown';
  }

  extractSymbols(filePath, content) {
    const lines = content.split('\n');
    const symbols = [];

    const patterns = [
      /^\s*(?:static\s+)?(?:inline\s+)?(?:const\s+)?(?:unsigned\s+)?(?:void|int|char|float|double|bool|auto|[\w:]+)\s+(\w+)\s*\(/,
      /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/,
      /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/,
      /^\s*def\s+(\w+)\s*\(/,
      /^\s*class\s+(\w+)/
    ];

    lines.forEach((line, idx) => {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const name = match[1];
          symbols.push({
            name,
            type: line.includes('class') ? 'class' : 'function',
            file: filePath,
            line: idx + 1
          });
          if (!this.index.symbols[name]) {
            this.index.symbols[name] = [];
          }
          this.index.symbols[name].push({ file: filePath, line: idx + 1 });
        }
      }
    });
  }

  searchFiles(keywords, repos = [], language = null, maxResults = 50) {
    const results = [];
    for (const [filePath, fileInfo] of Object.entries(this.index.files)) {
      if (language && fileInfo.language !== language) continue;
      if (keywords.some(kw => filePath.toLowerCase().includes(kw.toLowerCase()))) {
        results.push({ path: filePath, language: fileInfo.language });
        if (results.length >= maxResults) break;
      }
    }
    return results;
  }

  searchSymbols(name, type = null, repos = []) {
    const symbols = this.index.symbols[name] || [];
    if (type) {
      return symbols.filter(s => s.type === type);
    }
    return symbols;
  }

  traceCalls(symbol, direction = 'both', maxDepth = 3) {
    return this.searchSymbols(symbol);
  }

  analyzeImpact(files, symbols = []) {
    const affectedFiles = new Set(files);
    const affectedSymbols = [];

    for (const file of files) {
      for (const [name, locs] of Object.entries(this.index.symbols)) {
        if (locs.some(loc => loc.file === file)) {
          affectedSymbols.push(name);
        }
      }
    }

    return {
      affectedFiles: Array.from(affectedFiles),
      affectedSymbols,
      riskLevel: affectedSymbols.length > 10 ? 'high' : affectedSymbols.length > 5 ? 'medium' : 'low'
    };
  }

  computeBlastRadius(files, symbols = []) {
    return this.analyzeImpact(files, symbols);
  }

  findHubNodes(topN = 10) {
    const symbolCounts = Object.entries(this.index.symbols)
      .map(([name, locs]) => ({ name, count: locs.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);
    return symbolCounts;
  }

  findBridgeNodes(topN = 10) {
    return this.findHubNodes(topN);
  }

  close() {
    this.saveIndex();
  }
}

module.exports = IndexBuilder;
