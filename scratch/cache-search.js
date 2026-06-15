import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// 模拟带有文件缓存的搜索类
class CachedSearch {
  constructor(cacheDir = './.search_cache') {
    this.cacheDir = cacheDir;
  }

  // 生成唯一的缓存文件名 (使用 SHA-256 避免特殊字符导致的文件路径问题)
  getCachePath(query) {
    const hash = crypto.createHash('sha256').update(query).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }

  async search(query) {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const cachePath = this.getCachePath(query);

    try {
      // 尝试读取缓存
      const cachedData = await fs.readFile(cachePath, 'utf8');
      const { data, timestamp } = JSON.parse(cachedData);
      
      // 检查缓存是否在 1 小时内有效
      if (Date.now() - timestamp < 3600000) {
        console.log(`✨ [Cache HIT] 命中本地缓存，查询词: "${query}" (省去了网络请求！)`);
        return data;
      }
    } catch {
      // 缓存不存在或损坏，继续进行网络请求
    }

    console.log(`🌐 [Cache MISS] 发起网络请求，查询词: "${query}"...`);
    
    // 模拟网络请求延迟 (2秒)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const fakeResult = `Search results for "${query}" at ${new Date().toISOString()}: Found 42 useful articles.`;

    // 写入缓存
    await fs.writeFile(
      cachePath,
      JSON.stringify({ data: fakeResult, timestamp: Date.now() }, null, 2),
      'utf8'
    );
    return fakeResult;
  }
}

// 运行测试验证
async function runTest() {
  const searcher = new CachedSearch();
  
  console.time('第一次搜索 (No Cache)');
  const res1 = await searcher.search('Scheme Compiler Tutorial');
  console.log('结果大小:', res1.length);
  console.timeEnd('第一次搜索 (No Cache)');

  console.log('\n----------------------------------------\n');

  console.time('第二次搜索 (Cache Hit)');
  const res2 = await searcher.search('Scheme Compiler Tutorial');
  console.log('结果大小:', res2.length);
  console.timeEnd('第二次搜索 (Cache Hit)');
  
  // 清理测试目录
  await fs.rm('./.search_cache', { recursive: true, force: true });
}

runTest();
