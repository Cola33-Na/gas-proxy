// Cloudflare Pages Function - 反向代理到 GAS（加入快取）
export async function onRequest(context) {
  const { request, env, ctx } = context;
  
  const GAS_URL = env.GAS_URL || 'https://script.google.com/macros/s/AKfycbw5ZPLmXwFOtPgErt9dn9AndOeqrDQD9lUXQv1i6qwygOu9x7WdWYF87jDTCpYDhg7G/exec';
  const url = new URL(request.url);
  const targetUrl = new URL(GAS_URL);
  
  // 保留路徑和查詢參數
  const path = url.pathname.replace('/api', '') || '/';
  targetUrl.pathname = path;
  targetUrl.search = url.search;
  
  // 建立快取鍵
  const cacheKey = new Request(targetUrl.toString(), request);
  const cache = caches.default;
  
  // 如果是 GET 請求，嘗試從快取讀取
  if (request.method === 'GET') {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      // 回傳快取結果，不會打到 GAS
      const newResponse = new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: cachedResponse.headers,
      });
      
      // 加入快取標頭提示
      newResponse.headers.set('X-Cache', 'HIT');
      return newResponse;
    }
  }
  
  // 建立新請求
  const modifiedRequest = new Request(targetUrl, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers),
      'X-Forwarded-Host': url.hostname,
      'X-Real-IP': request.headers.get('CF-Connecting-IP') || '',
    },
    body: request.body,
  });
  
  try {
    const response = await fetch(modifiedRequest);
    
    // 建立新回應
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    
    // 移除洩露資訊的 headers
    ['x-google-apps-script', 'x-cloud-trace-context', 'via'].forEach(h => {
      newResponse.headers.delete(h);
    });
    
    // 加入安全 headers
    newResponse.headers.set('X-Content-Type-Options', 'nosniff');
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    
    // 加入快取標頭提示
    newResponse.headers.set('X-Cache', 'MISS');
    
    // 如果是 GET 請求且成功，寫入快取（快取 5 分鐘）
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
