const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const IndexBuilder = require('../lib/index-builder');

const TEST_DB = '/tmp/test-index.db';
const TEST_DIR = '/tmp/test-code';

test('IndexBuilder - initialization', () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  const builder = new IndexBuilder(TEST_DB);
  assert.ok(builder);
  builder.close();
});

test('IndexBuilder - index C file', () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

  const testFile = path.join(TEST_DIR, 'test.c');
  fs.writeFileSync(testFile, `
#include <stdio.h>

void helper() {
  printf("helper\\n");
}

int main() {
  helper();
  return 0;
}
  `);

  const builder = new IndexBuilder(TEST_DB);
  const result = builder.indexFile(testFile, TEST_DIR);

  assert.ok(result.updated);
  assert.ok(result.fileId);

  const symbols = builder.searchSymbols('helper');
  assert.ok(symbols.length > 0);
  assert.strictEqual(symbols[0].name, 'helper');

  builder.close();
});

test('IndexBuilder - incremental update', () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

  const testFile = path.join(TEST_DIR, 'test.c');
  fs.writeFileSync(testFile, 'void foo() {}');

  const builder = new IndexBuilder(TEST_DB);
  const result1 = builder.indexFile(testFile, TEST_DIR);
  assert.ok(result1.updated);

  const result2 = builder.indexFile(testFile, TEST_DIR);
  assert.strictEqual(result2.updated, false);

  fs.writeFileSync(testFile, 'void bar() {}');
  const result3 = builder.indexFile(testFile, TEST_DIR);
  assert.ok(result3.updated);

  builder.close();
});

test('IndexBuilder - trace calls', () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

  const testFile = path.join(TEST_DIR, 'test.c');
  fs.writeFileSync(testFile, `
void helper() {}
void caller() { helper(); }
  `);

  const builder = new IndexBuilder(TEST_DB);
  builder.indexFile(testFile, TEST_DIR);

  const trace = builder.traceCalls('helper');
  assert.ok(trace.callers.length > 0);

  builder.close();
});

test('IndexBuilder - compute blast radius', () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

  const testFile = path.join(TEST_DIR, 'test.c');
  fs.writeFileSync(testFile, `
void core() {}
void a() { core(); }
void b() { core(); }
  `);

  const builder = new IndexBuilder(TEST_DB);
  builder.indexFile(testFile, TEST_DIR);

  const radius = builder.computeBlastRadius('core');
  assert.strictEqual(radius.direct, 2);

  builder.close();
});

test('IndexBuilder - find hub nodes', () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });

  const testFile = path.join(TEST_DIR, 'test.c');
  fs.writeFileSync(testFile, `
void hub() {}
void c1() { hub(); }
void c2() { hub(); }
void c3() { hub(); }
void c4() { hub(); }
void c5() { hub(); }
  `);

  const builder = new IndexBuilder(TEST_DB);
  builder.indexFile(testFile, TEST_DIR);

  const hubs = builder.findHubNodes(5);
  assert.ok(hubs.length > 0);
  assert.strictEqual(hubs[0].name, 'hub');

  builder.close();
});
