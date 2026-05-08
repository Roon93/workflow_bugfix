#!/usr/bin/env node
// 验证所有原生模块可正常加载并运行，用于打包后的端到端检查

const path = require('path');
const root = path.resolve(__dirname, '..');

function req(name) {
  return require(path.join(root, 'node_modules', name));
}

let failed = false;

function check(name, fn) {
  try {
    fn();
    console.log('  OK:', name);
  } catch (e) {
    console.error('  FAIL:', name, '-', e.message);
    failed = true;
  }
}

check('tree-sitter + tree-sitter-python (parse)', () => {
  const Parser = req('tree-sitter');
  const Python = req('tree-sitter-python');
  const p = new Parser();
  p.setLanguage(Python);
  const tree = p.parse('def hello(): pass');
  if (!tree.rootNode) throw new Error('rootNode is null');
});

check('tree-sitter-c (load)', () => { req('tree-sitter-c'); });
check('tree-sitter-cpp (load)', () => { req('tree-sitter-cpp'); });
check('tree-sitter-typescript (load)', () => {
  const { typescript, tsx } = req('tree-sitter-typescript');
  if (!typescript || !tsx) throw new Error('typescript or tsx export missing');
});

check('better-sqlite3 (create db)', () => {
  const Database = req('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (1)');
  const row = db.prepare('SELECT x FROM t').get();
  if (row.x !== 1) throw new Error('query returned wrong value');
  db.close();
});

if (failed) {
  console.error('\n验证失败，请重新编译原生模块后再打包。');
  process.exit(1);
} else {
  console.log('\n所有模块验证通过。');
}
