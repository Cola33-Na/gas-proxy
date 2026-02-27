export async function onRequest(context) {
  const { request, env, ctx } = context;
  
  const GAS_URL = env.GAS_URL || 'https://script.google.com/macros/s/AKfycbw5ZPLmXwFOtPgErt9dn9AndOeqrDQD9lUXQv1i6qwygOu9x7WdWYF87jDTCpYDhg7G/exec';
  const url = new URL(request.url);
  const targetUrl = new URL(GAS_URL);
  
  const path = url.pathname.replace('/api', '') || '/';
  targetUrl.pathname = path;
  targetUrl.search = url.search;
  
  // 快取處理
  const cacheKey = new Request(targetUrl.toString(), request);
  const cache = caches.default;
  
  if (request.method === 'GET') {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const newResponse = new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: cachedResponse.headers,
      });
      newResponse.headers.set('X-Cache', 'HIT');
      return newResponse;
    }
  }
  
  // 關鍵修改：模擬真實瀏覽器請求
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
  };
  
  // 合併原始請求的 headers（但覆蓋關鍵欄位）
  const finalHeaders = {
    ...Object.fromEntries(request.headers),
    ...browserHeaders,
    // 移除可能暴露代理的 headers
    'CF-Connecting-IP': null,
    'CF-Ray': null,
    'CF-Visitor': null,
    'X-Forwarded-For': null,
    'X-Forwarded-Proto': null,
  };
  
  // 清理 null 值
  Object.keys(finalHeaders).forEach(key => {
    if (finalHeaders[key] === null) delete finalHeaders[key];
  });
  
  const modifiedRequest = new Request(targetUrl, {
    method: request.method,
    headers: finalHeaders,
    body: request.body,
  });
  
  try {
    const response = await fetch(modifiedRequest);
    
    // 如果還是 429，嘗試使用不同的請求方式
    if (response.status === 429) {
      // 回傳友善錯誤訊息
      return new Response(JSON.stringify({
        success: false,
        error: 'Google 暫時阻擋了請求，請稍後再試',
        retryAfter: '30秒後重試'
      }), {
        status: 200, // 回傳 200 避免前端錯誤
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Retry-After': '30',
        },
      });
    }
    
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    
    ['x-google-apps-script', 'x-cloud-trace-context', 'via'].forEach(h => {
      newResponse.headers.delete(h);
    });
    
    newResponse.headers.set('X-Content-Type-Options', 'nosniff');
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('X-Cache', 'MISS');
    
    if (request.method === 'GET' && response.status === 200) {
      newResponse.headers.set('Cache-Control', 'public, max-age=300');
      ctx.waitUntil(cache.put(cacheKey, newResponse.clone()));
    }
    
    return newResponse;
    
  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Proxy Error',
      message: error.message,
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
