# NextBridge — Edge Proxy Infrastructure

This directory houses the edge proxy architectures and serverless gateway workers used by NextBridge to connect client applications directly to upstream education platforms without heavy 24/7 background scrapers or database overhead.

---

## Architecture Directory

```
proxy/
├── cloudflare/
│   ├── nexttoppers-gateway/     # Direct, on-demand NextToppers API Gateway (V8 Edge)
│   │   ├── worker.js            # Unified real-time folder, video & direct PDF resolver
│   │   ├── wrangler.toml        # Cloudflare Wrangler configuration
│   │   ├── package.json         # Worker scripts (dev, deploy)
│   │   └── README.md            # Deployment guide & API specification
│   └── pw-cors-proxy/           # Cloudflare Worker for PW static & gateway CORS proxy
│       ├── worker.js            # High-speed edge streaming proxy for static.pw.live
│       ├── wrangler.toml        # Cloudflare Wrangler configuration
│       └── README.md            # Usage & deployment guide
└── README.md                    # This file
```

---

## 1. NextToppers Edge Gateway (`cloudflare/nexttoppers-gateway`)
- **Purpose**: Eliminates the 24/7 scraping loop (`sync_loop.js`).
- **Functionality**:
  - Dynamically proxies student requests to `course.nexttoppers.com/course/all-content`.
  - Injects student Bearer tokens dynamically from Firebase RTDB configuration.
  - Automatically resolves **both** direct CloudFront `.m3u8` video streams (via string derivation) and **direct CloudFront `.pdf` documents** (`https://dylnd2lqy6eys.cloudfront.net/...pdf`).
  - Edge-cached via Cloudflare `caches.default` (10-minute TTL) for sub-10ms response times across India.

## 2. Physics Wallah CORS Proxy (`cloudflare/pw-cors-proxy`)
- **Purpose**: High-speed, zero-cold-start replacement for Render/Netlify CORS proxying.
- **Functionality**:
  - Proxies `static.pw.live` PDF documents and NextHope stream manifests with `Access-Control-Allow-Origin: *`.
  - Preserves Netlify's 100 GB/month bandwidth limit.
