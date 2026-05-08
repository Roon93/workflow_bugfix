const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  // 跳过的目录名（精确匹配目录名，不是路径）
  skipDirs: [
    '.git', 'node_modules', '.svn', '.hg',
    // 通用构建产物
    'build', 'dist', 'out', 'output', 'target',
    // Buildroot 特有
    'dl',           // 下载的 tarball
    'host',         // 交叉编译工具链
    'staging',      // staging sysroot
    'per-package',  // 隔离构建目录
    // Python
    '__pycache__', '.pytest_cache', '.mypy_cache', '.tox',
    // 第三方
    'vendor', 'third_party', 'third-party', 'thirdparty',
    // 缓存/临时
    '.cache', '.tmp', 'tmp', 'temp',
    // 覆盖率
    'coverage', '.nyc_output',
    // CMake
    'CMakeFiles', '.cmake',
  ],

  // 索引的源文件扩展名
  sourceExts: ['.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.ts', '.tsx', '.js', '.jsx', '.py'],

  // 单文件最大字节数（超过则跳过）
  maxFileSize: 512 * 1024,

  // 每个 worker 每批处理的文件数
  workerBatch: 50,

  // compile_commands.json 的候选搜索路径（相对于 repoRoot）
  // Buildroot 把它生成在 output/ 下
  compileCommandsPaths: [
    'compile_commands.json',
    'output/compile_commands.json',
    'build/compile_commands.json',
  ],

  // 是否解析 Buildroot .config 来过滤禁用的包
  buildrootConfig: true,

  // worker 线程数上限（0 = 自动，取 floor(cpus * 0.75)）
  maxWorkers: 0,

  // 索引引擎：'tree-sitter' | 'ctags' | 'ctags+cscope'
  indexer: 'tree-sitter',
};

/**
 * 加载配置：先用默认值，再用 repoRoot/.bugfix/index-config.json 覆盖
 */
function loadConfig(repoRoot) {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS)); // deep copy

  const cfgPath = path.join(repoRoot, '.bugfix', 'index-config.json');
  if (fs.existsSync(cfgPath)) {
    let user;
    try { user = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
    catch (e) {
      process.stderr.write(`[index-config] warning: failed to parse ${cfgPath}: ${e.message}\n`);
      return cfg;
    }

    if (Array.isArray(user.skipDirs))    cfg.skipDirs    = user.skipDirs;
    if (Array.isArray(user.sourceExts))  cfg.sourceExts  = user.sourceExts;
    if (typeof user.maxFileSize === 'number') cfg.maxFileSize = user.maxFileSize;
    if (typeof user.workerBatch === 'number') cfg.workerBatch = user.workerBatch;
    if (Array.isArray(user.compileCommandsPaths)) cfg.compileCommandsPaths = user.compileCommandsPaths;
    if (typeof user.buildrootConfig === 'boolean') cfg.buildrootConfig = user.buildrootConfig;
    if (typeof user.maxWorkers === 'number') cfg.maxWorkers = user.maxWorkers;
    if (typeof user.indexer === 'string')    cfg.indexer    = user.indexer;
  }

  return cfg;
}

module.exports = { loadConfig, DEFAULTS };
