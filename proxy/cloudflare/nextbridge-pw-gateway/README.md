# NextBridge — Physics Wallah Edge Gateway (Cloudflare Worker)

Zero-cold-start, edge-cached serverless gateway for Physics Wallah content, lectures, notes, DPPs, and DRM-encrypted video streams.

## Key Features

1. **Direct AWS CloudFront Video Streaming**:
   - Manifest rewriter pre-signs MPEG-DASH `master.mpd` segment templates.
   - Client video players stream `.m4s` chunks directly from AWS CloudFront edge PoPs across India (10–25ms latency).
   - **0 Cloudflare Worker requests** consumed during video playback, completely avoiding Cloudflare free-tier daily caps.

2. **Automated ClearKey DRM Resolution**:
   - Parses the `default_KID` from the video manifest on the fly.
   - Resolves decryption keys from the ClearKey OTP service and delivers them directly in the `parcham_vid` response.

3. **Direct PDF 302 Redirection**:
   - Resolves note/DPP attachments directly to `https://static.pw.live/...` via HTTP 302 Found.
   - Zero document payload passes through the worker.

4. **100% Drop-in RPC Interface**:
   - Full support for `POST /api/data`:
     - `pw_btch_dtl`: Batch details & subjects
     - `pw_sub_topics`: Subject chapters & units
     - `pw_sch_cntnt`: Chapter lectures, notes, and DPPs
     - `pw_sch_dtl`: Schedule attachment resolution
     - `pw_dpp_lst`: DPP quiz item lists
     - `parcham_vid`: Video manifest + ClearKey DRM payload
     - `pw_tdy_sch`: Daily live schedule

5. **Edge Caching**:
   - Batches, subjects, and chapters are cached at Cloudflare edge locations for 10–30 minutes for sub-15ms navigation speeds.

---

## Deployment Instructions

### Option 1: Deploy via Wrangler CLI
```bash
cd proxy/cloudflare/nextbridge-pw-gateway
$env:CLOUDFLARE_API_TOKEN="<your_cloudflare_api_token>"
npx wrangler deploy
```

### Option 2: Deploy via Cloudflare Dashboard
1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages**.
2. Click **Create Application** > **Create Worker**.
3. Name it `nextbridge-pw-gateway`.
4. Paste the contents of `worker.js` into the Quick Edit code editor.
5. Click **Deploy**.

---

## Connecting NextBridge App to the Worker

Once deployed, update the `PW_BASE_URL` in `src/services/PwApiService.js`:

```javascript
const PW_BASE_URL = 'https://nextbridge-pw-gateway.<your-subdomain>.workers.dev';
```
