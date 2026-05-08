const fs = require('fs');
const path = require('path');

class LogParser {
  constructor(patternsFile = '.bugfix/log-patterns.json') {
    this.patterns = this.loadPatterns(patternsFile);
  }

  loadPatterns(patternsFile) {
    if (fs.existsSync(patternsFile)) {
      return JSON.parse(fs.readFileSync(patternsFile, 'utf8'));
    }
    // 默认模式
    return {
      timestampPattern: '\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}',
      levelPatterns: {
        error: ['ERROR', 'ERR', 'FATAL'],
        warn: ['WARN', 'WARNING'],
        info: ['INFO'],
        debug: ['DEBUG', 'DBG']
      },
      logFunctionPatterns: ['LOG_.*\\(', 'log_.*\\(', 'printf\\(', 'fprintf\\('],
      errorCodePattern: 'error[_\\s]code[:\\s]*(\\d+)'
    };
  }

  // 流式扫描日志，不把全量 entries 返回给调用方
  // 只返回摘要 + 前 N 条错误行，避免大日志撑爆 agent 上下文
  parse(logFile, { maxErrorSamples = 20 } = {}) {
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n');
    let errorCount = 0, warnCount = 0;
    const errorSamples = [];

    const timestampRegex = new RegExp(this.patterns.timestampPattern);
    const errorCodeRegex = new RegExp(this.patterns.errorCodePattern, 'i');

    for (const line of lines) {
      if (!line.trim()) continue;

      let level = null;
      for (const [lvl, patterns] of Object.entries(this.patterns.levelPatterns)) {
        if (patterns.some(p => line.includes(p))) {
          level = lvl;
          break;
        }
      }

      if (level === 'error') {
        errorCount++;
        if (errorSamples.length < maxErrorSamples) {
          const ts = (line.match(timestampRegex) || [])[0] || null;
          const ec = (line.match(errorCodeRegex) || [])[1] || null;
          const fl = line.match(/([a-zA-Z0-9_\-\/\.]+\.[a-z]+):(\d+)/);
          const fn = (line.match(/(?:in function|function:)\s+['"]?([a-zA-Z0-9_]+)['"]?/i) || [])[1] || null;
          errorSamples.push({
            timestamp: ts,
            errorCode: ec,
            file: fl ? fl[1] : null,
            lineNo: fl ? parseInt(fl[2]) : null,
            function: fn,
            message: line.replace(ts || '', '').replace(/^[:\s]+/, '').trim()
          });
        }
      } else if (level === 'warn') {
        warnCount++;
      }
    }

    return {
      summary: { totalLines: lines.length, errorCount, warnCount },
      errorSamples
    };
  }

  extractClues(logFile, keywords = []) {
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n');
    const clues = [];
    const seen = new Set();

    const errorCodeRegex = new RegExp(this.patterns.errorCodePattern, 'i');

    const add = (type, value, context) => {
      const key = `${type}:${value}`;
      if (!seen.has(key)) {
        seen.add(key);
        clues.push({ type, value, context });
      }
    };

    for (const line of lines) {
      if (!line.trim()) continue;

      const isError = this.patterns.levelPatterns.error.some(p => line.includes(p));
      const isWarn  = this.patterns.levelPatterns.warn.some(p => line.includes(p));
      if (!isError && !isWarn && keywords.length === 0) continue;

      const ec = (line.match(errorCodeRegex) || [])[1];
      if (ec) add('error_code', ec, line.trim());

      const fl = line.match(/([a-zA-Z0-9_\-\/\.]+\.[a-z]+):(\d+)/);
      if (fl) add('file', fl[1], `File: ${fl[1]}, Line: ${fl[2]}`);

      const fn = (line.match(/(?:in function|function:)\s+['"]?([a-zA-Z0-9_]+)['"]?/i) || [])[1];
      if (fn) add('function', fn, line.trim());

      if (keywords.length > 0) {
        const lower = line.toLowerCase();
        for (const kw of keywords) {
          if (lower.includes(kw.toLowerCase())) add('keyword', kw, line.trim());
        }
      }
    }

    return { clues };
  }
}

module.exports = { LogParser };
