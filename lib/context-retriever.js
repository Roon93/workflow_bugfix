#!/usr/bin/env node
import { IndexBuilder } from './index-builder.js';

export class ContextRetriever {
  constructor(dbPath = '.bugfix/index.db') {
    this.indexBuilder = new IndexBuilder(dbPath);
  }

  async searchFiles(keywords, repos = [], language = null, maxResults = 50) {
    return this.indexBuilder.searchFiles(keywords, repos, language, maxResults);
  }

  async searchSymbols(name, type = null, repos = []) {
    return this.indexBuilder.searchSymbols(name, type, repos);
  }

  async traceCalls(symbol, direction = 'both', maxDepth = 3) {
    return this.indexBuilder.traceCalls(symbol, direction, maxDepth);
  }

  async analyzeImpact(files, symbols = []) {
    return this.indexBuilder.analyzeImpact(files, symbols);
  }

  async computeBlastRadius(files, symbols = []) {
    return this.indexBuilder.computeBlastRadius(files, symbols);
  }

  async findHubNodes(topN = 10) {
    return this.indexBuilder.findHubNodes(topN);
  }

  async findBridgeNodes(topN = 10) {
    return this.indexBuilder.findBridgeNodes(topN);
  }

  close() {
    this.indexBuilder.close();
  }
}
