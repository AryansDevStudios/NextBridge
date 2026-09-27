# NextBridge General & PW Edge CORS Proxy (Cloudflare Worker)

A lightning-fast, zero-cold-start edge CORS proxy built on Cloudflare Workers. Designed to stream Physics Wallah (`static.pw.live`) PDFs, video manifests, and arbitrary third-party web assets directly to NextBridge web and mobile clients.

---

## 🌟 Why Cloudflare Worker CORS Proxy over Render/Netlify?

| Feature | Render Free Tier | Netlify Functions | Cloudflare Edge Worker |
| :--- | :--- | :--- | :--- |
| **Cold Start** | ~50 seconds when spun down | 1–3 seconds | **0ms (V8 Isolate)** |
| **Latency** | 200–600ms (US/EU host) | 100–300ms | **5–15ms (Edge POPs in India)** |
| **Bandwidth Limit** | High risk of limits | 100 GB/month limit | **Uncapped bandwidth** on free tier |
| **Range Requests (206)** | Partial / buffered | Limited | **Native byte-range streaming** |
| **Cost** | Free sleeps after 15 min | Free tier limits | **100,000 requests/day free** |

---

## 📡 API Usage

### Proxying any Document or Asset
```http
GET https://<your-worker>.workers.dev/?url=https%3A%2F%2Fstatic.pw.live%2Fpath%2Fto%2Fdocument.pdf
```
or
```http
GET https://<your-worker>.workers.dev/proxy?url=https%3A%2F%2Fstatic.pw.live%2Fpath%2Fto%2Fdocument.pdf
```

### Response Headers
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
- `Accept-Ranges: bytes`
- `X-Edge-Cache: HIT | MISS`

---

## 🚀 Deployment Instructions

### Prerequisites
- Node.js (v18+)
- Cloudflare Account

### Quick Deploy
```bash
# 1. Navigate to this directory
cd proxy/cloudflare/pw-cors-proxy

# 2. Login to Cloudflare
npx wrangler login

# 3. Deploy
npx wrangler deploy
```

Once deployed, update the CORS proxy URL in `src/utils/proxyHandler.js` or `PdfViewerModal.jsx`.
