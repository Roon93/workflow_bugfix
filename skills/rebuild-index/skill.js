const { IndexBuilder } = require('../../lib/index-builder.js');

module.exports = async function rebuildIndex(args) {
  const builder = new IndexBuilder('.bugfix/index.db');

  builder.indexDirectory('./');

  const stats = builder.db.prepare('SELECT COUNT(*) as count FROM files').get();
  const symbolCount = builder.db.prepare('SELECT COUNT(*) as count FROM symbols').get();
  const callCount = builder.db.prepare('SELECT COUNT(*) as count FROM calls').get();

  builder.close();

  return {
    success: true,
    message: '代码索引已重建',
    stats: {
      files: stats.count,
      symbols: symbolCount.count,
      calls: callCount.count
    }
  };
};
