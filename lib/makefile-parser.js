const fs = require('fs');
const path = require('path');

// 支持四种构建系统：
//   1. compile_commands.json  — 最精确，直接列出每个编译单元
//   2. CMakeLists.txt         — 提取 add_executable/add_library 的源文件列表
//   3. Makefile / .mk         — 提取 SRCS/SOURCES/OBJ 变量和显式规则里的 .c/.cpp 文件
//                               支持 Buildroot 的 PACKAGE_SRCS / PACKAGE_CFILES 命名约定
//   4. Buildroot .config      — 辅助过滤：跳过未启用包的目录
//
// 返回值：{ compiled: Set<string(绝对路径)>, buildSystem: string, confidence: 'high'|'medium'|'low' }

function parseBuildSystem(repoRoot, cfg = {}) {
  const compileCommandsPaths = cfg.compileCommandsPaths || [
    'compile_commands.json',
    'output/compile_commands.json',
    'build/compile_commands.json',
  ];

  // 优先级：compile_commands.json > CMakeLists.txt > Makefile
  for (const rel of compileCommandsPaths) {
    const ccdb = path.isAbsolute(rel) ? rel : path.join(repoRoot, rel);
    if (fs.existsSync(ccdb)) return parseCompileCommands(ccdb, repoRoot);
  }

  const cmake = path.join(repoRoot, 'CMakeLists.txt');
  if (fs.existsSync(cmake)) return parseCMake(cmake, repoRoot);

  const makefile = findMakefile(repoRoot);
  if (makefile) {
    const result = parseMakefile(makefile, repoRoot);
    // Buildroot 项目：用 .config 过滤禁用的包目录
    if (result && cfg.buildrootConfig !== false) {
      const disabled = parseBuildrootDisabledDirs(repoRoot);
      if (disabled.size > 0) {
        const before = result.compiled.size;
        for (const f of [...result.compiled]) {
          for (const dir of disabled) {
            if (f.startsWith(dir + path.sep) || f.startsWith(dir + '/')) {
              result.compiled.delete(f);
              break;
            }
          }
        }
        const removed = before - result.compiled.size;
        if (removed > 0) {
          process.stderr.write(`[makefile-parser] buildroot .config: removed ${removed} files from disabled packages\n`);
        }
        result.buildSystem = 'Makefile+.config';
      }
    }
    return result;
  }

  return null;
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
  const vars = {};

  const scanFile = (filePath, baseDir) => {
    let content;
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch { return; }

    const setRe = /\bset\s*\(\s*(\w+)\s+([\s\S]*?)\)/gi;
    let m;
    while ((m = setRe.exec(content)) !== null) {
      vars[m[1]] = m[2].replace(/\s+/g, ' ').trim();
    }

    const srcRe = /\b(?:add_executable|add_library|target_sources)\s*\(\s*\w+[^)]*?\)/gi;
    while ((m = srcRe.exec(content)) !== null) {
      const expanded = m[0].replace(/\$\{(\w+)\}/g, (_, v) => vars[v] || '');
      for (const rawToken of expanded.split(/[\s\n\r]+/)) {
        // 去掉括号等非路径字符后再判断
        const token = rawToken.replace(/[()]/g, '');
        if (/\.(c|cpp|cc|cxx|py|ts|tsx|js|jsx)$/i.test(token)) {
          compiled.add(path.normalize(path.resolve(baseDir, token)));
        }
      }
    }

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

// Makefile / .mk：扫描变量赋值和显式规则
// 支持标准命名（SRCS/SOURCES/OBJ）和 Buildroot 命名（PACKAGE_SRCS/PACKAGE_CFILES 等）
function parseMakefile(makefilePath, repoRoot, _visited = new Set()) {
  if (_visited.has(makefilePath)) return null;
  _visited.add(makefilePath);

  const compiled = new Set();
  const baseDir = path.dirname(makefilePath);

  let content;
  try { content = fs.readFileSync(makefilePath, 'utf8'); }
  catch { return null; }

  const vars = {};

  // 变量赋值：VAR = / VAR := / VAR += / VAR ?=
  const varRe = /^(\w+)\s*[+:?]?=\s*(.+)$/gm;
  let m;
  while ((m = varRe.exec(content)) !== null) {
    vars[m[1]] = (vars[m[1]] ? vars[m[1]] + ' ' : '') + m[2].replace(/\\\n/g, ' ').trim();
  }

  const extractSrcs = (text) => {
    const expanded = text.replace(/\$[\(\{](\w+)[\)\}]/g, (_, v) => vars[v] || '');
    for (const token of expanded.split(/\s+/)) {
      if (/\.(c|cpp|cc|cxx|py|ts|tsx|js|jsx)$/i.test(token) && !token.includes('$')) {
        compiled.add(path.normalize(path.resolve(baseDir, token)));
      }
    }
  };

  // 扫描所有变量值（标准命名 + Buildroot 命名约定）
  const SRC_VAR_RE = /^(?:SRCS?|SOURCES?|OBJ(?:ECTS?)?|C(?:XX)?FILES?|.*_SRCS?|.*_SOURCES?|.*_CFILES?|.*_CXXFILES?|.*_OBJS?)$/i;
  for (const [name, val] of Object.entries(vars)) {
    if (SRC_VAR_RE.test(name)) extractSrcs(val);
  }

  // 显式规则目标（%.o: %.c 或 foo.o: foo.c bar.h）
  const ruleRe = /^[\w\.\/%\-]+\.o\s*:\s*(.+)$/gm;
  while ((m = ruleRe.exec(content)) !== null) extractSrcs(m[1]);

  // include 子 Makefile（含 .mk 文件，Buildroot 大量使用）
  const incRe = /^-?include\s+(.+)$/gm;
  while ((m = incRe.exec(content)) !== null) {
    for (const inc of m[1].split(/\s+/)) {
      if (!inc || inc.includes('$')) continue;
      const incPath = path.resolve(baseDir, inc);
      if (fs.existsSync(incPath) && incPath !== makefilePath) {
        const sub = parseMakefile(incPath, repoRoot, _visited);
        if (sub) sub.compiled.forEach(f => compiled.add(f));
      }
    }
  }

  return { compiled, buildSystem: path.basename(makefilePath), confidence: 'low' };
}

// 解析 Buildroot .config，返回禁用包对应的 package/ 子目录绝对路径集合
function parseBuildrootDisabledDirs(repoRoot) {
  const disabled = new Set();
  const configPath = path.join(repoRoot, '.config');
  if (!fs.existsSync(configPath)) return disabled;

  let content;
  try { content = fs.readFileSync(configPath, 'utf8'); }
  catch { return disabled; }

  // 收集所有启用的包名：BR2_PACKAGE_FOO=y
  const enabled = new Set();
  const enabledRe = /^BR2_PACKAGE_([A-Z0-9_]+)=y$/gm;
  let m;
  while ((m = enabledRe.exec(content)) !== null) {
    enabled.add(m[1].toLowerCase().replace(/_/g, '-'));
    enabled.add(m[1].toLowerCase().replace(/-/g, '_'));
  }

  // 扫描 package/ 目录，把未启用的包目录加入禁用集合
  const pkgDir = path.join(repoRoot, 'package');
  if (!fs.existsSync(pkgDir)) return disabled;

  let entries;
  try { entries = fs.readdirSync(pkgDir, { withFileTypes: true }); }
  catch { return disabled; }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const nameHyphen = name.replace(/_/g, '-');
    const nameUnderscore = name.replace(/-/g, '_');
    if (!enabled.has(name) && !enabled.has(nameHyphen) && !enabled.has(nameUnderscore)) {
      disabled.add(path.join(pkgDir, name));
    }
  }

  return disabled;
}

function findMakefile(repoRoot) {
  for (const name of ['GNUmakefile', 'Makefile', 'makefile']) {
    const p = path.join(repoRoot, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

module.exports = { parseBuildSystem };
