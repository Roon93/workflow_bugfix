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

  parse(logFile) {
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n');
    const entries = [];
    let errorCount = 0, warnCount = 0;

    const timestampRegex = new RegExp(this.patterns.timestampPattern);
    const errorCodeRegex = new RegExp(this.patterns.errorCodePattern, 'i');

    for (const line of lines) {
      if (!line.trim()) continue;

      const entry = { line };

      // 提取时间戳
      const timestampMatch = line.match(timestampRegex);
      if (timestampMatch) {
        entry.timestamp = timestampMatch[0];
      }

      // 提取日志级别
      for (const [level, patterns] of Object.entries(this.patterns.levelPatterns)) {
        if (patterns.some(p => line.includes(p))) {
          entry.level = level.toUpperCase();
          if (level === 'error') errorCount++;
          if (level === 'warn') warnCount++;
          break;
        }
      }

      // 提取错误码
      const errorCodeMatch = line.match(errorCodeRegex);
      if (errorCodeMatch) {
        entry.errorCode = errorCodeMatch[1];
      }

      // 提取文件名和行号（常见格式：file.c:123）
      const fileLineMatch = line.match(/([a-zA-Z0-9_\-\/\.]+\.[a-z]+):(\d+)/);
      if (fileLineMatch) {
        entry.file = fileLineMatch[1];
        entry.line = parseInt(fileLineMatch[2]);
      }

      // 提取函数名（常见格式：in function 'xxx' 或 function: xxx）
      const functionMatch = line.match(/(?:in function|function:)\s+['"]?([a-zA-Z0-9_]+)['"]?/i);
      if (functionMatch) {
        entry.function = functionMatch[1];
      }

      // 提取消息（去除时间戳和级别后的内容）
      let message = line;
      if (entry.timestamp) {
        message = message.replace(entry.timestamp, '').trim();
      }
      if (entry.level) {
        message = message.replace(new RegExp(entry.level, 'i'), '').trim();
      }
      entry.message = message.replace(/^[:\s]+/, '');

      entries.push(entry);
    }

    return {
      entries,
      summary: {
        totalLines: lines.length,
        errorCount,
        warnCount
      }
    };
  }

  extractClues(logFile, keywords = []) {
    const parsed = this.parse(logFile);
    const clues = [];

    for (const entry of parsed.entries) {
      // 错误码线索
      if (entry.errorCode) {
        clues.push({
          type: 'error_code',
          value: entry.errorCode,
          context: entry.message
        });
      }

      // 函数名线索
      if (entry.function) {
        clues.push({
          type: 'function',
          value: entry.function,
          context: entry.message
        });
      }

      // 文件名线索
      if (entry.file) {
        clues.push({
          type: 'file',
          value: entry.file,
          context: `File: ${entry.file}, Line: ${entry.line || 'unknown'}`
        });
      }

      // 关键词匹配
      if (keywords.length > 0) {
        const lowerMessage = entry.message.toLowerCase();
        for (const keyword of keywords) {
          if (lowerMessage.includes(keyword.toLowerCase())) {
            clues.push({
              type: 'keyword',
              value: keyword,
              context: entry.message
            });
          }
        }
      }
    }

    // 去重
    const uniqueClues = [];
    const seen = new Set();
    for (const clue of clues) {
      const key = `${clue.type}:${clue.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueClues.push(clue);
      }
    }

    return { clues: uniqueClues };
  }
}

module.exports = { LogParser };
