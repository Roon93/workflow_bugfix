const fs = require('fs');
const path = require('path');

// 支持三种构建系统：
//   1. compile_commands.json  — 最精确，直接列出每个编译单元
//   2. CMakeLists.txt         — 提取 add_executable/add_library 的源文件列表
//   3. Makefile               — 提取 SRCS/SOURCES/OBJ 变量和显式规则里的 .c/.cpp 文件
//
// 返回值：{ compiled: Set<string(绝对路径)>, buildSystem: string, confidence: 'high'|'medium'|'low' }
// confidence 表示解析结果的可信度：
//   high   — compile_commands.json，完全精确
//   medium — CMakeLists.txt 静态解析，变量展开可能不完整
//   low    — Makefile 文本扫描，可能有遗漏

function parseBuildSystem(repoRoot) {
  // 优先级：compile_commands.json > CMakeLists.txt > Makefile
  const ccdb = path.join(repoRoot, 'compile_commands.json');
  if (fs.existsSync(ccdb)) return parseCompileCommands(ccdb, repoRoot);

  const cmake = path.join(repoRoot, 'CMakeLists.txt');
  if (fs.existsSync(cmake)) return parseCMake(cmake, repoRoot);

  const makefile = findMakefile(repoRoot);
  if (makefile) return parseMakefile(makefile, repoRoot);

  return null; // 没有找到构建文件，不做过滤
}

// compile_commands.json：每条记录有 "file" 字段，直接用
function parseCompileCommands(ccdbPath, repoRoot) {
  let entries;
  try { entries = JSON.parse(fs.readFileSync(ccdbPath, 'utf8')); }
  catch { return null; }

  const compiled = new Set();
  for (const entry of entries) {
    if (!entry.file) continue;
    const abs = path.isAbsolute(entry.file)
      ? entry.file
      : path.resolve(entry.directory || repoRoot, entry.file);
    compiled.add(path.normalize(abs));
  }
  return { compiled, buildSystem: 'compile_commands.json', confidence: 'high' };
}

// CMakeLists.txt：扫描 add_executable/add_library/target_sources 调用
function parseCMake(cmakePath, repoRoot) {
  const compiled = new Set();
  const vars = {}; // 简单变量表，用于展开 ${VAR}

  const scanFile = (filePath, baseDir) => {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch { return; }

    // 提取变量定义：set(VAR file1.c file2.c ...)
    const setRe = /\bset\s*\(\s*(\w+)\s+([\s\S]*?)\)/gi;
    let m;
    while ((m = setRe.exec(content)) !== null) {
      const varName = m[1];
      const val = m[2].replace(/\s+/g, ' ').trim();
      vars[varName] = val;
    }

    // 提取源文件：add_executable/add_library/target_sources 的参数
    const srcRe = /\b(?:add_executable|add_library|target_sources)\s*\(\s*\w+[^)]*?\)/gi;
    while ((m = srcRe.exec(content)) !== null) {
      const block = m[0];
      // 展开变量引用
      const expanded = block.replace(/\$\{(\w+)\}/g, (_, v) => vars[v] || '');
      // 提取所有看起来像源文件的 token
      for (const token of expanded.split(/[\s\n\r]+/)) {
        if (/\.(c|cpp|cc|cxx|py|ts|tsx|js|jsx)$/i.test(token)) {
          const abs = path.resolve(baseDir, token);
          compiled.add(path.normalize(abs));
        }
      }
    }

    // 递归处理 add_subdirectory
    const subdirRe = /\badd_subdirectory\s*\(\s*([^\s)]+)/gi;
    while ((m = subdirRe.exec(content)) !== null) {
      const sub = path.resolve(baseDir, m[1]);
      const subCmake = path.join(sub, 'CMakeLists.txt');
      if (fs.existsSync(subCmake)) scanFile(subCmake, sub);
    }
  };

  scanFile(cmakePath, repoRoot);
  return { compiled, buildSystem: 'CMakeLists.txt', confidence: 'medium' };
}

// Makefile：扫描变量赋值和显式规则
function parseMakefile(makefilePath, repoRoot) {
  const compiled = new Set();
  const baseDir = path.dirname(makefilePath);

  let content;
  try { content = fs.readFileSync(makefilePath, 'utf8'); }
  catch { return null; }

  const vars = {};

  // 变量赋值：VAR = / VAR := / VAR += 后面跟源文件
  const varRe = /^(\w+)\s*[+:?]?=\s*(.+)$/gm;
  let m;
  while ((m = varRe.exec(content)) !== null) {
    vars[m[1]] = (vars[m[1]] ? vars[m[1]] + ' ' : '') + m[2].replace(/\\\n/g, ' ').trim();
  }

  // 展开变量，提取源文件
  const extractSrcs = (text) => {
    const expanded = text.replace(/\$[\(\{](\w+)[\)\}]/g, (_, v) => vars[v] || '');
    for (const token of expanded.split(/\s+/)) {
      if (/\.(c|cpp|cc|cxx|py|ts|tsx|js|jsx)$/i.test(token) && !token.includes('$')) {
        const abs = path.resolve(baseDir, token);
        compiled.add(path.normalize(abs));
      }
    }
  };

  // 扫描所有变量值
  for (const val of Object.values(vars)) extractSrcs(val);

  // 扫描显式规则目标（%.o: %.c 或 foo.o: foo.c bar.h）
  const ruleRe = /^[\w\.\/%\-]+\.o\s*:\s*(.+)$/gm;
  while ((m = ruleRe.exec(content)) !== null) extractSrcs(m[1]);

  // 扫描 include 的子 Makefile（常见：include src/module.mk）
  const incRe = /^-?include\s+(.+)$/gm;
  while ((m = incRe.exec(content)) !== null) {
    for (const inc of m[1].split(/\s+/)) {
      const incPath = path.resolve(baseDir, inc);
      if (fs.existsSync(incPath) && incPath !== makefilePath) {
        const sub = parseMakefile(incPath, repoRoot);
        if (sub) sub.compiled.forEach(f => compiled.add(f));
      }
    }
  }

  return { compiled, buildSystem: path.basename(makefilePath), confidence: 'low' };
}

function findMakefile(repoRoot) {
  for (const name of ['GNUmakefile', 'Makefile', 'makefile']) {
    const p = path.join(repoRoot, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { parseBuildSystem };
