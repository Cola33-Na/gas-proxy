// Cloudflare Pages Function - 反向代理到 GAS
export async function onRequest(context) {
  const { request, env } = context;
  
  // 你的 GAS Web App 網址 - 請務必替換！
  const GAS_URL = env.GAS_URL || 'https://script.google.com/macros/s/AKfycbw5ZPLmXwFOtPgErt9dn9AndOeqrDQD9lUXQv1i6qwygOu9x7WdWYF87jDTCpYDhg7G/exec';
  
  // 取得原始路徑和查詢參數
  const url = new URL(request.url);
  const targetUrl = new URL(GAS_URL);
  
  // 保留路徑結構（移除 /api 前綴）
  const path = url.pathname.replace('/api', '') || '/';
  targetUrl.pathname = path;
  targetUrl.search = url.search;
  
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
    // 發送到 GAS
    const response = await fetch(modifiedRequest);
    
    // 建立新回應
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    
    // 移除洩露 GAS 資訊的 headers
    const headersToRemove = [
      'x-google-apps-script',
      'x-cloud-trace-context',
      'via',
      'x-forwarded-for',
      'x-forwarded-proto',
    ];
    
    headersToRemove.forEach(h => newResponse.headers.delete(h));
    
    // 加入安全 headers
    newResponse.headers.set('X-Content-Type-Options', 'nosniff');
    newResponse.headers.set('X-Frame-Options', 'DENY');
    newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // CORS 設定
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
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
