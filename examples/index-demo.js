#!/usr/bin/env node

const IndexBuilder = require('../lib/index-builder');
const fs = require('fs');
const path = require('path');

// 示例：创建测试文件并索引
const testDir = '/tmp/index-test';
const dbPath = '/tmp/test.db';

if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// 创建测试 C 文件
const testFile = path.join(testDir, 'example.c');
fs.writeFileSync(testFile, `
#include <stdio.h>

void helper() {
  printf("Helper function\\n");
}

void process() {
  helper();
}

int main() {
  process();
  return 0;
}
`);

// 初始化索引
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const builder = new IndexBuilder(dbPath);

console.log('索引文件...');
const result = builder.indexFile(testFile, testDir);
console.log('索引结果:', result);

console.log('\n搜索符号 "helper":');
const symbols = builder.searchSymbols('helper');
console.log(symbols);

console.log('\n追踪 "helper" 的调用关系:');
const trace = builder.traceCalls('helper');
console.log(JSON.stringify(trace, null, 2));

console.log('\n计算 "helper" 的爆炸半径:');
const radius = builder.computeBlastRadius('helper');
console.log(radius);

console.log('\n查找 Hub 节点:');
const hubs = builder.findHubNodes(1);
console.log(hubs);

builder.close();
console.log('\n完成！');
