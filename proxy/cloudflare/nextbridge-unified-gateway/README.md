# NextBridge Unified Cloudflare Edge Gateway

A unified, high-performance Cloudflare Edge Worker (V8 isolates) that combines both the **NextToppers (NT)** and **Physics Wallah (PW)** real-time gateways into a single maintainable deployment.

## Features

### NextToppers (NT) Engine (`/nt/...`)
- Real-time folder & course queries to `course.nexttoppers.com` (Zero Caching for instant updates)
- Automated token injection from Firebase RTDB
- Multi-tier PDF Resolution (Direct CloudFront -> NextHope Edge -> EduVibe AES Decryptor)
- Algorithmic HLS Stream Derivation from MP4 download URLs
- Universal CORS Proxy for third-party media and documents

### Physics Wallah (PW) Engine (`/pw/...`)
- 100% Drop-in RPC Compatible: Implements `POST /api/data` with all actions:
  - `pw_sch_cntnt` (Class notes & DPPs with full key validation)
  - `pw_sch_dtl` (Real-time live database lookup for direct attachment URLs)
  - `parcham_vid` (Multi-tier signed query resolution)
  - `batch_details`, `batch_subjects`, `subject_chapters`, `chapter_content`
- CORS-Safe MPD Rewriting & Segment Streamer (`/manifest/:folder/...`):
  - Injects canonical BaseURL pointing back to worker for reliable CORS
  - Seamless Range-header passthrough (HTTP 206) for video seeking
- ClearKey DRM Engine: Default KID extraction and key resolution via `get-otp`
- Direct PDF Resolution: Redirects `/api/lxpdf` directly to `static.pw.live` (302)

## Route Map

| Category | Route | Purpose |
|---|---|---|
| **Health** | `GET /` or `GET /health` | Unified health & status inspection |
| **NT Content** | `GET /nt/api/folder?courseId=&folderId=` | Real-time folder & chapter contents |
| **NT PDF** | `GET /nt/api/resolve-pdf?contentId=&courseId=` | On-demand PDF resolution pipeline |
| **NT Proxy** | `GET /nt/api/proxy?url=` | Universal CORS proxy |
| **PW RPC** | `POST /pw/api/data` | PW batch, content, and video RPC dispatcher |
| **PW Stream** | `GET /pw/manifest/:folder/master.mpd` | Rewritten MPD manifest with CORS |
| **PW Chunks** | `GET /pw/manifest/:folder/:chunk` | Proxied audio/video segments with Range support |
| **PW PDF** | `GET /pw/api/lxpdf?batchId=&...` | 302 redirect to direct `static.pw.live` PDF |
| **PW Batches** | `GET /pw/api/AllBatches` | PW batch catalog lookup |

### Backward Compatibility (Legacy Routes)
All legacy routes without `/nt` or `/pw` prefixes (`/api/data`, `/manifest/...`, `/api/folder`, `/api/resolve-pdf`, etc.) are fully supported and routed automatically.

## Deployment

```bash
cd proxy/cloudflare/nextbridge-unified-gateway
npx wrangler deploy
```
