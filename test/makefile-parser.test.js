const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseBuildSystem } = require('../lib/makefile-parser');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mp-test-'));
}
function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ── compile_commands.json ─────────────────────────────────────────────────────

test('parseBuildSystem: compile_commands.json 绝对路径', () => {
  const dir = tmpDir();
  const srcFile = path.join(dir, 'main.c');
  fs.writeFileSync(srcFile, '');
  fs.writeFileSync(path.join(dir, 'compile_commands.json'), JSON.stringify([
    { file: srcFile, directory: dir, command: 'cc main.c' }
  ]));

  const result = parseBuildSystem(dir);
  assert.equal(result.buildSystem, 'compile_commands.json');
  assert.equal(result.confidence, 'high');
  assert.ok(result.compiled.has(path.normalize(srcFile)));
  cleanup(dir);
});

test('parseBuildSystem: compile_commands.json 相对路径', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'foo.c'), '');
  fs.writeFileSync(path.join(dir, 'compile_commands.json'), JSON.stringify([
    { file: 'foo.c', directory: dir, command: 'cc foo.c' }
  ]));

  const result = parseBuildSystem(dir);
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'foo.c'))));
  cleanup(dir);
});

test('parseBuildSystem: 搜索 output/compile_commands.json', () => {
  const dir = tmpDir();
  const outDir = path.join(dir, 'output');
  fs.mkdirSync(outDir);
  const srcFile = path.join(dir, 'src.c');
  fs.writeFileSync(srcFile, '');
  fs.writeFileSync(path.join(outDir, 'compile_commands.json'), JSON.stringify([
    { file: srcFile, directory: dir, command: 'cc src.c' }
  ]));

  const result = parseBuildSystem(dir);
  assert.equal(result.buildSystem, 'compile_commands.json');
  assert.ok(result.compiled.has(path.normalize(srcFile)));
  cleanup(dir);
});

test('parseBuildSystem: compile_commands.json 损坏时返回 null', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'compile_commands.json'), 'not json');
  const result = parseBuildSystem(dir);
  assert.equal(result, null);
  cleanup(dir);
});

// ── CMakeLists.txt ────────────────────────────────────────────────────────────

test('parseBuildSystem: CMakeLists.txt add_executable', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'main.c'), '');
  fs.writeFileSync(path.join(dir, 'util.c'), '');
  fs.writeFileSync(path.join(dir, 'CMakeLists.txt'),
    'cmake_minimum_required(VERSION 3.10)\nadd_executable(myapp main.c util.c)\n');

  const result = parseBuildSystem(dir);
  assert.equal(result.buildSystem, 'CMakeLists.txt');
  assert.equal(result.confidence, 'medium');
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'main.c'))));
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'util.c'))));
  cleanup(dir);
});

test('parseBuildSystem: CMakeLists.txt 变量展开', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'a.c'), '');
  fs.writeFileSync(path.join(dir, 'b.c'), '');
  fs.writeFileSync(path.join(dir, 'CMakeLists.txt'),
    'set(SRCS a.c b.c)\nadd_library(mylib ${SRCS})\n');

  const result = parseBuildSystem(dir);
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'a.c'))));
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'b.c'))));
  cleanup(dir);
});

test('parseBuildSystem: CMakeLists.txt add_subdirectory 递归', () => {
  const dir = tmpDir();
  const subDir = path.join(dir, 'sub');
  fs.mkdirSync(subDir);
  fs.writeFileSync(path.join(subDir, 'sub.c'), '');
  fs.writeFileSync(path.join(dir, 'CMakeLists.txt'),
    'add_subdirectory(sub)\n');
  fs.writeFileSync(path.join(subDir, 'CMakeLists.txt'),
    'add_library(sublib sub.c)\n');

  const result = parseBuildSystem(dir);
  assert.ok(result.compiled.has(path.normalize(path.join(subDir, 'sub.c'))));
  cleanup(dir);
});

// ── Makefile ──────────────────────────────────────────────────────────────────

test('parseBuildSystem: Makefile SRCS 变量', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'a.c'), '');
  fs.writeFileSync(path.join(dir, 'b.c'), '');
  fs.writeFileSync(path.join(dir, 'Makefile'),
    'SRCS = a.c b.c\nall: $(SRCS)\n');

  const result = parseBuildSystem(dir);
  assert.equal(result.confidence, 'low');
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'a.c'))));
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'b.c'))));
  cleanup(dir);
});

test('parseBuildSystem: Makefile Buildroot PACKAGE_SRCS 命名', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'foo.c'), '');
  fs.writeFileSync(path.join(dir, 'bar.c'), '');
  fs.writeFileSync(path.join(dir, 'Makefile'),
    'MYAPP_SRCS = foo.c bar.c\n');

  const result = parseBuildSystem(dir);
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'foo.c'))));
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'bar.c'))));
  cleanup(dir);
});

test('parseBuildSystem: Makefile 显式规则 .o: .c', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'main.c'), '');
  fs.writeFileSync(path.join(dir, 'Makefile'),
    'main.o: main.c\n\tcc -c main.c\n');

  const result = parseBuildSystem(dir);
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'main.c'))));
  cleanup(dir);
});

test('parseBuildSystem: Makefile include 子文件', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'mod.c'), '');
  fs.writeFileSync(path.join(dir, 'module.mk'),
    'MOD_SRCS = mod.c\n');
  fs.writeFileSync(path.join(dir, 'Makefile'),
    'include module.mk\n');

  const result = parseBuildSystem(dir);
  assert.ok(result.compiled.has(path.normalize(path.join(dir, 'mod.c'))));
  cleanup(dir);
});

test('parseBuildSystem: Makefile include 循环不崩溃', () => {
  const dir = tmpDir();
  // a.mk include b.mk, b.mk include a.mk
  fs.writeFileSync(path.join(dir, 'a.mk'), 'include b.mk\nA_SRCS = a.c\n');
  fs.writeFileSync(path.join(dir, 'b.mk'), 'include a.mk\nB_SRCS = b.c\n');
  fs.writeFileSync(path.join(dir, 'Makefile'), 'include a.mk\n');

  // 不应抛出异常或栈溢出
  assert.doesNotThrow(() => parseBuildSystem(dir));
  cleanup(dir);
});

// ── Buildroot .config 过滤 ────────────────────────────────────────────────────

test('parseBuildSystem: .config 过滤禁用包目录', () => {
  const dir = tmpDir();
  const pkgDir = path.join(dir, 'package');
  const enabledPkg = path.join(pkgDir, 'busybox');
  const disabledPkg = path.join(pkgDir, 'python3');
  fs.mkdirSync(enabledPkg, { recursive: true });
  fs.mkdirSync(disabledPkg, { recursive: true });

  // busybox 启用，python3 未启用
  fs.writeFileSync(path.join(dir, '.config'),
    'BR2_PACKAGE_BUSYBOX=y\n# BR2_PACKAGE_PYTHON3 is not set\n');

  // Makefile 里两个包的文件都列出来
  const busyboxSrc = path.join(enabledPkg, 'busybox.c');
  const python3Src = path.join(disabledPkg, 'python3.c');
  fs.writeFileSync(busyboxSrc, '');
  fs.writeFileSync(python3Src, '');
  fs.writeFileSync(path.join(dir, 'Makefile'),
    `BUSYBOX_SRCS = package/busybox/busybox.c\nPYTHON3_SRCS = package/python3/python3.c\n`);

  const result = parseBuildSystem(dir, { buildrootConfig: true });
  assert.ok(result.compiled.has(path.normalize(busyboxSrc)));
  assert.ok(!result.compiled.has(path.normalize(python3Src)));
  assert.equal(result.buildSystem, 'Makefile+.config');
  cleanup(dir);
});

test('parseBuildSystem: 包名含连字符和下划线互换', () => {
  const dir = tmpDir();
  const pkgDir = path.join(dir, 'package');
  const pkg = path.join(pkgDir, 'my-lib'); // 目录名用连字符
  fs.mkdirSync(pkg, { recursive: true });

  // .config 里用下划线
  fs.writeFileSync(path.join(dir, '.config'), 'BR2_PACKAGE_MY_LIB=y\n');
  fs.writeFileSync(path.join(pkg, 'mylib.c'), '');
  fs.writeFileSync(path.join(dir, 'Makefile'),
    'MY_LIB_SRCS = package/my-lib/mylib.c\n');

  const result = parseBuildSystem(dir, { buildrootConfig: true });
  // my-lib 应被识别为已启用，不应被过滤掉
  assert.ok(result.compiled.has(path.normalize(path.join(pkg, 'mylib.c'))));
  cleanup(dir);
});

test('parseBuildSystem: 无构建文件返回 null', () => {
  const dir = tmpDir();
  const result = parseBuildSystem(dir);
  assert.equal(result, null);
  cleanup(dir);
});

test('parseBuildSystem: buildrootConfig=false 时不解析 .config', () => {
  const dir = tmpDir();
  const pkgDir = path.join(dir, 'package');
  const disabledPkg = path.join(pkgDir, 'disabled-pkg');
  fs.mkdirSync(disabledPkg, { recursive: true });
  const src = path.join(disabledPkg, 'x.c');
  fs.writeFileSync(src, '');
  fs.writeFileSync(path.join(dir, '.config'), '# BR2_PACKAGE_DISABLED_PKG is not set\n');
  fs.writeFileSync(path.join(dir, 'Makefile'), 'DISABLED_PKG_SRCS = package/disabled-pkg/x.c\n');

  const result = parseBuildSystem(dir, { buildrootConfig: false });
  // 不过滤，文件应该在
  assert.ok(result.compiled.has(path.normalize(src)));
  cleanup(dir);
});
