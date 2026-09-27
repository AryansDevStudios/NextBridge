# NextToppers Edge Gateway (Cloudflare Worker)

High-performance, zero-maintenance V8 Edge Gateway for real-time NextToppers browsing and media streaming in **NextBridge**.

---

## 🌟 Key Features

1. **Direct-to-Source On-Demand Queries**:
   - Queries `course.nexttoppers.com/course/all-content` in real-time when a student navigates a folder.
   - Completely replaces the 24/7 background scraper (`sync_loop.js`) and huge Firebase RTDB storage trees.

2. **4-Tier Resilient PDF Resolution Hierarchy**:
   - **Tier 0 (Local/Flat Index)**: 9,530+ direct CloudFront PDF URLs compiled from archive batches in Firebase RTDB `/pdf_index/<id>.json` (~60 bytes per lookup).
   - **Tier 1 (Native NextToppers API)**: Direct unmasked CloudFront URL when requested with an active token.
   - **Tier 2 (NextHope High-Availability Edge Gateway)**: `https://nt.nexthope.site/api/content-details` (High uptime, 0ms cold starts, clean JSON).
   - **Tier 3 (EduVibe Emergency Decryptor)**: `eduvibe-2tkn.onrender.com` + WebCrypto AES-128 decryptor.
   - **Self-Healing Auto-Save**: Any PDF resolved via Tier 2 or 3 is automatically saved back to Firebase RTDB (`PUT /pdf_index/<id>.json`) in a non-blocking background task (`ctx.waitUntil`). Future requests hit Tier 0 in 15ms!

3. **Instant Algorithmic HLS (.m3u8) Stream Derivation**:
   - Converts protected `download_urls` directly into live AWS CloudFront HLS master playlist URLs in 0ms using regex extraction without sending any extra requests.

4. **Edge Caching via `caches.default` with Stale-While-Revalidate**:
   - Folders are cached at Cloudflare edge POPs with a 3-minute TTL and 5-minute `stale-while-revalidate`.
   - Pull-to-refresh (`?refresh=1` or `no-cache`) bypasses the cache instantly for 0-second live updates.

5. **Universal Wildcard CORS Proxy**:
   - Built-in `/api/proxy?url=...` endpoint with `Access-Control-Allow-Origin: *` to load external resources without CORS restrictions.

---

## 📡 API Endpoints

### 1. Folder & Content Exploration
```http
GET /api/folder?courseId={courseId}&folderId={folderId}&page=1&limit=200
```
- **Parameters**:
  - `courseId` *(required)*: e.g. `630`
  - `folderId` *(optional, default `0`)*: Chapter/Subject folder ID
  - `page` *(optional, default `1`)*
  - `limit` *(optional, default `200`)*

- **Response Sample**:
```json
{
  "success": true,
  "courseId": "630",
  "folderId": "0",
  "folders": [
    {
      "id": "14758",
      "title": "PHYSICS",
      "isFolder": true,
      "folderId": "14758",
      "courseId": "630",
      "itemCount": 45,
      "videoCount": 30,
      "pdfCount": 15
    }
  ],
  "items": [
    {
      "id": "104921",
      "title": "Electrostatics Lecture 01",
      "type": "video",
      "url": "https://dbil3go8szhu6.cloudfront.net/file_library/videos/channel_vod_non_drm_hls/2143/6398f.../6398f..._98f...m3u8",
      "hlsUrl": "https://dbil3go8szhu6.cloudfront.net/...",
      "duration": 4820,
      "thumbnail": "https://..."
    },
    {
      "id": "104922",
      "title": "Electrostatics Class Notes",
      "type": "pdf",
      "url": "https://dylnd2lqy6eys.cloudfront.net/1770981347/admin_v2/content/pdf/630/notes.pdf",
      "rawFileUrl": "https://dylnd2lqy6eys.cloudfront.net/...",
      "courseId": "630"
    }
  ],
  "total": 2
}
```

### 2. PDF Dynamic Link Fallback Resolver
```http
GET /api/resolve-pdf?shortCode={shortCode}
```
Resolves legacy dynamic links (`/dl/r/<shortCode>`) directly to their destination PDF URL.

### 3. Edge CORS Proxy
```http
GET /api/proxy?url={targetUrl}
```
Proxies any media or document with open CORS headers.

### 4. Health Check
```http
GET /health
```
Returns worker status, active edge POP (e.g. `DEL`, `BOM`), and token cache status.

---

## 🚀 Deployment Instructions

### Prerequisites
- Node.js (v18+)
- Free Cloudflare Account (100,000 requests/day free tier)

### Quick Deploy
```bash
# 1. Navigate to this directory
cd proxy/cloudflare/nexttoppers-gateway

# 2. Login to Cloudflare (one-time interactive login)
npx wrangler login

# 3. Deploy worker to your Cloudflare account
npx wrangler deploy
```

Once deployed, Wrangler outputs your live URL:
```
https://nextbridge-nt-gateway.<your-subdomain>.workers.dev
```

You can plug this URL directly into NextBridge's `NtApiService.js`.
