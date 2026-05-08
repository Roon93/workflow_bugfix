const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { IndexBuilder } = require('../lib/index-builder');

// ── 测试工具 ──────────────────────────────────────────────────────────────────

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ib-test-'));
}

function tmpDb() {
  return path.join(os.tmpdir(), `ib-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function cleanup(...paths) {
  for (const p of paths) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
    for (const ext of ['-wal', '-shm']) {
      try { fs.unlinkSync(p + ext); } catch {}
    }
  }
}

// ── index-config 集成 ─────────────────────────────────────────────────────────

test('loadConfig: 无配置文件时返回默认值', () => {
  const { loadConfig, DEFAULTS } = require('../lib/index-config');
  const cfg = loadConfig('/nonexistent/path');
  assert.deepEqual(cfg.sourceExts, DEFAULTS.sourceExts);
  assert.equal(cfg.maxFileSize, DEFAULTS.maxFileSize);
  assert.equal(cfg.workerBatch, DEFAULTS.workerBatch);
  assert.equal(cfg.buildrootConfig, true);
});

test('loadConfig: 读取用户配置文件并覆盖默认值', () => {
  const { loadConfig } = require('../lib/index-config');
  const dir = tmpDir();
  const bugfixDir = path.join(dir, '.bugfix');
  fs.mkdirSync(bugfixDir);
  fs.writeFileSync(path.join(bugfixDir, 'index-config.json'), JSON.stringify({
    maxFileSize: 1024,
    workerBatch: 10,
    skipDirs: ['custom_skip'],
    buildrootConfig: false,
  }));
  const cfg = loadConfig(dir);
  assert.equal(cfg.maxFileSize, 1024);
  assert.equal(cfg.workerBatch, 10);
  assert.deepEqual(cfg.skipDirs, ['custom_skip']);
  assert.equal(cfg.buildrootConfig, false);
  cleanup(dir);
});

test('loadConfig: 配置文件 JSON 损坏时回退到默认值', () => {
  const { loadConfig, DEFAULTS } = require('../lib/index-config');
  const dir = tmpDir();
  const bugfixDir = path.join(dir, '.bugfix');
  fs.mkdirSync(bugfixDir);
  fs.writeFileSync(path.join(bugfixDir, 'index-config.json'), 'not json {{{');
  const cfg = loadConfig(dir);
  assert.equal(cfg.maxFileSize, DEFAULTS.maxFileSize);
  cleanup(dir);
});

// ── IndexBuilder 基础 ─────────────────────────────────────────────────────────

test('IndexBuilder: 初始化创建数据库和表', () => {
  const db = tmpDb();
  const builder = new IndexBuilder(db);
  // files/symbols/calls 表存在
  const tables = builder.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  assert.ok(tables.includes('files'));
  assert.ok(tables.includes('symbols'));
  assert.ok(tables.includes('calls'));
  // compiled 列存在
  const cols = builder.db.prepare("PRAGMA table_info(files)").all().map(r => r.name);
  assert.ok(cols.includes('compiled'));
  builder.close();
  cleanup(db);
});

test('IndexBuilder: 旧库迁移补 compiled 列', () => {
  const db = tmpDb();
  // 先建一个没有 compiled 列的旧表
  const Database = require('better-sqlite3');
  const raw = new Database(db);
  raw.exec(`CREATE TABLE files (path TEXT PRIMARY KEY, hash TEXT NOT NULL, language TEXT NOT NULL, indexed_at INTEGER NOT NULL)`);
  raw.close();

  const builder = new IndexBuilder(db);
  const cols = builder.db.prepare("PRAGMA table_info(files)").all().map(r => r.name);
  assert.ok(cols.includes('compiled'));
  builder.close();
  cleanup(db);
});

// ── indexFile ─────────────────────────────────────────────────────────────────

test('indexFile: 索引 C 文件，写入符号', () => {
  const dir = tmpDir();
  const db = tmpDb();
  const f = path.join(dir, 'a.c');
  fs.writeFileSync(f, 'void helper() {}\nint main() { helper(); return 0; }\n');

  const builder = new IndexBuilder(db);
  builder.indexFile(f, dir);

  const syms = builder.searchSymbols('helper');
  assert.equal(syms.length, 1);
  assert.equal(syms[0].name, 'helper');
  assert.equal(syms[0].type, 'function');

  builder.close();
  cleanup(db, dir);
});

test('indexFile: 内容未变时不重复写入', () => {
  const dir = tmpDir();
  const db = tmpDb();
  const f = path.join(dir, 'b.c');
  fs.writeFileSync(f, 'void foo() \n');

  const builder = new IndexBuilder(db);
  builder.indexFile(f, dir);
  const count1 = builder.db.prepare('SELECT COUNT(*) as n FROM symbols').get().n;

  builder.indexFile(f, dir); // 内容未变，不应重复插入
  const count2 = builder.db.prepare('SELECT COUNT(*) as n FROM symbols').get().n;
  assert.equal(count1, count2);

  builder.close();
  cleanup(db, dir);
});

test('indexFile: 内容变更后更新符号', () => {
  const dir = tmpDir();
  const db = tmpDb();
  const f = path.join(dir, 'c.c');
  fs.writeFileSync(f, 'void old_func() {}\n');

  const builder = new IndexBuilder(db);
  builder.indexFile(f, dir);
  assert.equal(builder.searchSymbols('old_func').length, 1);

  fs.writeFileSync(f, 'void new_func() {}\n');
  builder.indexFile(f, dir);
  assert.equal(builder.searchSymbols('old_func').length, 0);
  assert.equal(builder.searchSymbols('new_func').length, 1);

  builder.close();
  cleanup(db, dir);
});

test('indexFile: 超大文件跳过', () => {
  const dir = tmpDir();
  const db = tmpDb();
  const f = path.join(dir, 'big.c');
  // 写入超过 maxFileSize 的文件
  fs.writeFileSync(f, Buffer.alloc(600 * 1024, 'x'));

  const builder = new IndexBuilder(db);
  builder.indexFile(f, dir);
  const count = builder.db.prepare('SELECT COUNT(*) as n FROM files').get().n;
  assert.equal(count, 0);

  builder.close();
  cleanup(db, dir);
});

test('indexFile: 二进制文件跳过', () => {
  const dir = tmpDir();
  const db = tmpDb();
  const f = path.join(dir, 'bin.c');
  const buf = Buffer.alloc(100, 0); // 全零字节，触发二进制检测
  fs.writeFileSync(f, buf);

  const builder = new IndexBuilder(db);
  builder.indexFile(f, dir);
  const count = builder.db.prepare('SELECT COUNT(*) as n FROM files').get().n;
  assert.equal(count, 0);

  builder.close();
  cleanup(db, dir);
});

// ── indexDirectory（多核）────────────────────────────────────────────────────

test('indexDirectory: 多文件并行索引', async () => {
  const dir = tmpDir();
  const db = tmpDb();
  fs.writeFileSync(path.join(dir, 'a.c'), 'void fa() {}\n');
  fs.writeFileSync(path.join(dir, 'b.c'), 'void fb() {}\n');
  fs.writeFileSync(path.join(dir, 'c.c'), 'void fc() {}\n');

  const builder = new IndexBuilder(db);
  const stats = await builder.indexDirectory(dir, dir);

  assert.equal(stats.total, 3);
  assert.equal(stats.indexed, 3);
  assert.equal(stats.skipped, 0);
  assert.equal(builder.searchSymbols('fa').length, 1);
  assert.equal(builder.searchSymbols('fb').length, 1);
  assert.equal(builder.searchSymbols('fc').length, 1);

  builder.close();
  cleanup(db, dir);
});

test('indexDirectory: 增量索引跳过未变文件', async () => {
  const dir = tmpDir();
  const db = tmpDb();
  fs.writeFileSync(path.join(dir, 'x.c'), 'void fx() {}\n');

  const builder = new IndexBuilder(db);
  const s1 = await builder.indexDirectory(dir, dir);
  assert.equal(s1.indexed, 1);

  const s2 = await builder.indexDirectory(dir, dir);
  assert.equal(s2.indexed, 0);
  assert.equal(s2.skipped, 1);

  builder.close();
  cleanup(db, dir);
});

test('indexDirectory: skipDirs 配置生效', async () => {
  const dir = tmpDir();
  const db = tmpDb();
  // 在 output/ 子目录放文件，应被跳过
  const outDir = path.join(dir, 'output');
  fs.mkdirSync(outDir);
  fs.writeFileSync(path.join(outDir, 'gen.c'), 'void gen() {}\n');
  fs.writeFileSync(path.join(dir, 'main.c'), 'void main_fn() {}\n');

  const builder = new IndexBuilder(db);
  const stats = await builder.indexDirectory(dir, dir);

  assert.equal(stats.total, 1); // output/ 被跳过
  assert.equal(builder.searchSymbols('gen').length, 0);
  assert.equal(builder.searchSymbols('main_fn').length, 1);

  builder.close();
  cleanup(db, dir);
});

test('indexDirectory: compile_commands.json 过滤未编译文件', async () => {
  const dir = tmpDir();
  const db = tmpDb();
  fs.writeFileSync(path.join(dir, 'compiled.c'), 'void compiled_fn() {}\n');
  fs.writeFileSync(path.join(dir, 'unused.c'), 'void unused_fn() {}\n');

  // 只有 compiled.c 在编译数据库里
  const ccdb = [{ file: path.join(dir, 'compiled.c'), directory: dir, command: 'cc compiled.c' }];
  fs.writeFileSync(path.join(dir, 'compile_commands.json'), JSON.stringify(ccdb));

  const builder = new IndexBuilder(db);
  const stats = await builder.indexDirectory(dir, dir);

  // 两个文件都被记录，但 unused.c 标记为 notCompiled
  assert.equal(stats.total, 2);
  assert.equal(stats.notCompiled, 1);

  // compiled_fn 可以搜到（compiledOnly=true 默认）
  assert.equal(builder.searchSymbols('compiled_fn').length, 1);
  // unused_fn 不在 symbols 表里（未编译文件不索引符号，这是设计行为）
  assert.equal(builder.searchSymbols('unused_fn').length, 0);
  assert.equal(builder.searchSymbols('unused_fn', null, [], false).length, 0);
  // 但 unused.c 的路径记录在 files 表里，compiled=0
  const unusedFile = builder.db.prepare("SELECT compiled FROM files WHERE path LIKE '%unused.c'").get();
  assert.ok(unusedFile);
  assert.equal(unusedFile.compiled, 0);

  builder.close();
  cleanup(db, dir);
});

// ── traceCalls ────────────────────────────────────────────────────────────────

test('traceCalls: 追踪调用链', async () => {
  const dir = tmpDir();
  const db = tmpDb();
  fs.writeFileSync(path.join(dir, 't.c'), 'void leaf() {}\nvoid mid() { leaf(); }\nvoid top() { mid(); }\n');

  const builder = new IndexBuilder(db);
  await builder.indexDirectory(dir, dir);

  const callers = builder.traceCalls('leaf', 'callers', 3);
  const callerNames = callers.map(c => c.from);
  assert.ok(callerNames.includes('mid'));

  const callees = builder.traceCalls('top', 'callees', 3);
  const calleeNames = callees.map(c => c.to);
  assert.ok(calleeNames.includes('mid'));

  builder.close();
  cleanup(db, dir);
});

// ── analyzeImpact ─────────────────────────────────────────────────────────────

test('analyzeImpact: 返回受影响文件和符号', async () => {
  const dir = tmpDir();
  const db = tmpDb();
  fs.writeFileSync(path.join(dir, 'core.c'), 'void core_fn() {}\n');
  fs.writeFileSync(path.join(dir, 'user.c'), 'void user_fn() { core_fn(); }\n');

  const builder = new IndexBuilder(db);
  await builder.indexDirectory(dir, dir);

  const impact = builder.analyzeImpact(['core.c']);
  assert.ok(impact.affectedSymbols.includes('core_fn'));
  assert.ok(['low', 'medium', 'high'].includes(impact.riskLevel));

  builder.close();
  cleanup(db, dir);
});

// ── findHubNodes / findBridgeNodes ────────────────────────────────────────────

test('findHubNodes: 返回被调用最多的函数', async () => {
  const dir = tmpDir();
  const db = tmpDb();
  fs.writeFileSync(path.join(dir, 'h.c'),
    'void hub() {}\nvoid c1() { hub(); }\nvoid c2() { hub(); }\nvoid c3() { hub(); }\n');

  const builder = new IndexBuilder(db);
  await builder.indexDirectory(dir, dir);

  const hubs = builder.findHubNodes(5);
  assert.ok(hubs.length > 0);
  assert.equal(hubs[0].name, 'hub');
  assert.ok(hubs[0].count >= 3);

  builder.close();
  cleanup(db, dir);
});
