/**
 * ============================================================================
 * NextBridge — Physics Wallah & General Edge CORS Proxy (Cloudflare Worker)
 * ============================================================================
 * 
 * Features:
 * 1. Zero Cold Starts: Executes in <10ms on Cloudflare's global edge (200+ cities).
 * 2. High-speed streaming for PDFs (static.pw.live) and media manifests.
 * 3. Range Request Support: Full support for HTTP 206 Partial Content (PDF chunk loading & video scrubbing).
 * 4. Edge Caching: Caches static PDFs and assets for 24 hours at the edge.
 * 5. Wildcard CORS: Allows unrestricted access from web apps, mobile apps, and electron clients.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization, *',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

// Disallowed private / internal hostnames to prevent SSRF
const BLOCKED_HOST_REGEX = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|0\.0\.0\.0|::1)$/i;

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const targetUrlStr = url.searchParams.get('url');

    // 2. Health check / status if no target URL
    if (!targetUrlStr) {
      if (url.pathname === '/health' || url.pathname === '/') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            service: 'NextBridge Edge CORS Proxy',
            edgeLocation: request.cf?.colo || 'EDGE',
            usage: 'Pass ?url=https%3A%2F%2Ftarget.com%2Ffile.pdf',
          }),
          {
            status: 200,
            headers: {
              ...CORS_HEADERS,
              'Content-Type': 'application/json',
            },
          }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Missing target URL. Pass ?url=<target_url>' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Target URL validation & SSRF protection
    let targetUrl;
    try {
      targetUrl = new URL(targetUrlStr);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
      return new Response(
        JSON.stringify({ error: 'Only http and https protocols are supported' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    if (BLOCKED_HOST_REGEX.test(targetUrl.hostname)) {
      return new Response(
        JSON.stringify({ error: 'Access to private network targets is prohibited' }),
        { status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Forward Request with Range header preservation
    try {
      const forwardHeaders = new Headers();
      forwardHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
      forwardHeaders.set('Accept', '*/*');
      forwardHeaders.set('Accept-Encoding', 'identity');

      // Preserve Range header for PDF streaming & video chunking
      const range = request.headers.get('Range');
      if (range) {
        forwardHeaders.set('Range', range);
      }

      // Check Cloudflare Cache for non-range GET requests
      const isRange = Boolean(range);
      const cache = caches.default;
      const cacheKey = new Request(targetUrl.toString(), { method: 'GET' });

      if (!isRange && request.method === 'GET') {
        const cachedRes = await cache.match(cacheKey);
        if (cachedRes) {
          const res = new Response(cachedRes.body, cachedRes);
          Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
          res.headers.set('X-Edge-Cache', 'HIT');
          return res;
        }
      }

      const originRes = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: forwardHeaders,
        cf: {
          cacheTtl: 86400,
          cacheEverything: true,
        },
      });

      // Prepare response headers
      const responseHeaders = new Headers(originRes.headers);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));

      // Remove restrictive framing/CSP headers
      responseHeaders.delete('Content-Security-Policy');
      responseHeaders.delete('X-Frame-Options');

      // Ensure caching policy is friendly
      responseHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      responseHeaders.set('X-Edge-Cache', 'MISS');

      const response = new Response(originRes.body, {
        status: originRes.status,
        statusText: originRes.statusText,
        headers: responseHeaders,
      });

      // Cache successful full GET responses at the edge
      if (!isRange && request.method === 'GET' && originRes.status === 200) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }

      return response;
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Edge proxy failed to fetch: ${err.message}` }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }
  },
};
