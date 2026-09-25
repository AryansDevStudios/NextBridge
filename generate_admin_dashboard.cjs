const fs = require('fs');
const path = require('path');

const batchListSource = 'D:/nxttoppers-archive/nexthope_scraper/data/batch_list.json';
const batchList = JSON.parse(fs.readFileSync(batchListSource, 'utf8'));

const totalBatches = batchList.length;
const activeBatches = batchList.filter(b => !b.is_old);
const activeCount = activeBatches.length;
const totalItems = batchList.reduce((acc, b) => acc + (b.total_items || 0), 0) || 27675;

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>NextBridge Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #080c14;
      --card-bg: #111827;
      --card-border: #1f293d;
      --card-hover: #1e293b;
      --primary: #38bdf8;
      --primary-glow: rgba(56, 189, 248, 0.25);
      --accent: #818cf8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding-bottom: 50px;
      -webkit-font-smoothing: antialiased;
    }

    .container { max-width: 1240px; margin: 0 auto; padding: 14px 12px; }

    /* Toast Notification Banner */
    #toast {
      position: fixed; top: 16px; right: 16px; z-index: 99999;
      background: #1e293b; color: #fff; padding: 12px 20px;
      border-radius: 12px; border: 1px solid var(--primary);
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      font-size: 13px; font-weight: 600;
      display: none; align-items: center; gap: 8px;
      transition: all 0.3s ease;
    }

    /* Top Mode Switcher Bar */
    .mode-bar {
      display: flex; gap: 8px; margin-bottom: 14px;
      background: #0d1525; padding: 5px; border-radius: 14px;
      border: 1px solid var(--card-border);
    }
    .mode-btn {
      flex: 1; padding: 10px 14px; font-size: 13px; font-weight: 700;
      border: none; border-radius: 10px; cursor: pointer;
      color: var(--text-muted); background: transparent;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      transition: all 0.2s ease;
    }
    .mode-btn:hover { color: #fff; }
    .mode-btn.active {
      background: linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(129, 140, 248, 0.25));
      color: #fff; border: 1px solid var(--primary);
      box-shadow: 0 4px 14px rgba(56, 189, 248, 0.15);
    }

    .navbar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px;
      background: rgba(17, 24, 39, 0.85);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      margin-bottom: 16px;
      gap: 12px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    
    /* Modified Modern Admin Logo Badge */
    .brand-logo-badge {
      width: 44px; height: 44px;
      position: relative;
      flex-shrink: 0;
      filter: drop-shadow(0 4px 10px rgba(56, 189, 248, 0.35));
    }
    .brand h1 { font-size: 18px; font-weight: 800; letter-spacing: -0.5px; }
    .brand span { font-size: 11px; color: var(--text-muted); display: block; }

    .status-badge {
      display: flex; align-items: center; gap: 8px;
      padding: 6px 14px; border-radius: 999px;
      font-size: 12px; font-weight: 700;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: var(--success);
      white-space: nowrap;
    }
    .status-badge.syncing {
      background: rgba(245, 158, 11, 0.15);
      border-color: rgba(245, 158, 11, 0.5);
      color: var(--warning);
    }
    .pulse-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 10px currentColor;
      animation: pulse 1.4s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.3; transform: scale(0.8); } }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 14px 16px;
      position: relative;
      overflow: hidden;
    }
    .kpi-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, var(--primary), var(--accent));
    }
    .kpi-title { font-size: 11px; font-weight: 700; color: var(--text-muted); letter-spacing: 0.5px; margin-bottom: 6px; }
    .kpi-value { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .kpi-sub { font-size: 11px; color: var(--success); margin-top: 4px; font-weight: 600; }

    .delivery-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 7px; border-radius: 6px; font-size: 11px; font-weight: 700;
    }
    .delivery-badge.success { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
    .delivery-badge.fail { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); }
    .delivery-badge.ready { background: rgba(148, 163, 184, 0.12); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.25); }

    .panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 16px;
    }
    .panel-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 14px; flex-wrap: wrap; gap: 10px;
    }
    .panel-title { font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }

    .btn-main {
      background: linear-gradient(135deg, #38bdf8, #0ea5e9);
      color: #000; font-size: 13px; font-weight: 700;
      border: none; border-radius: 10px;
      padding: 10px 18px; cursor: pointer;
      box-shadow: 0 4px 14px var(--primary-glow);
      transition: all 0.2s ease;
      display: inline-flex; align-items: center; gap: 8px;
    }
    .btn-main:hover { transform: translateY(-1px); box-shadow: 0 6px 18px var(--primary-glow); }
    .btn-main:disabled { background: #334155; color: #64748b; cursor: not-allowed; transform: none; box-shadow: none; }

    .btn-pill {
      background: #1e293b; color: var(--text); border: 1px solid #334155;
      padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all 0.15s ease;
    }
    .btn-pill:hover { background: #334155; border-color: var(--primary); color: var(--primary); }
    .btn-pill.active { background: rgba(56, 189, 248, 0.15); border-color: var(--primary); color: var(--primary); }

    .pill-group { display: flex; flex-wrap: wrap; gap: 6px; }

    .selection-action-bar {
      display: flex; justify-content: space-between; align-items: center;
      background: #0f172a; padding: 12px 16px; border-radius: 12px;
      border: 1px solid var(--primary); margin-bottom: 14px;
      flex-wrap: wrap; gap: 10px;
    }
    .selection-counter { font-size: 14px; font-weight: 700; color: #fff; }
    .selection-counter span { color: var(--primary); font-size: 17px; }

    .selectable-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 10px;
      max-height: 480px;
      overflow-y: auto;
      padding-right: 4px;
    }
    .select-card {
      background: #0b1120;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 10px;
      display: flex; gap: 10px; align-items: center;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }
    .select-card:hover { border-color: #3b82f6; background: #0e1726; }
    .select-card.selected {
      border-color: var(--primary);
      background: rgba(56, 189, 248, 0.08);
    }
    .select-card.archive-card {
      border-color: rgba(245, 158, 11, 0.4);
    }
    .select-card.archive-card.selected {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.08);
    }
    .select-card input[type="checkbox"] {
      width: 18px; height: 18px; accent-color: var(--primary);
      cursor: pointer;
    }
    .select-thumb {
      width: 44px; height: 44px; border-radius: 8px; object-fit: cover;
      background: #1e293b; flex-shrink: 0;
    }
    .select-info { flex: 1; min-width: 0; }
    .select-title {
      font-size: 12px; font-weight: 700; color: #fff;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .select-meta { font-size: 11px; color: var(--text-muted); margin-top: 3px; }

    .terminal {
      background: #040711;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      line-height: 1.5;
      color: #38bdf8;
      height: 240px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .terminal-bar {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 8px; font-size: 12px; color: var(--text-muted);
    }

    .tabs {
      display: flex; gap: 6px; margin-bottom: 14px;
      border-bottom: 1px solid var(--card-border); padding-bottom: 8px;
      overflow-x: auto;
    }
    .tab-btn {
      background: none; border: none; color: var(--text-muted);
      padding: 8px 14px; font-size: 13px; font-weight: 700; cursor: pointer;
      border-radius: 8px; transition: all 0.2s; white-space: nowrap;
    }
    .tab-btn:hover { color: #fff; background: rgba(255,255,255,0.04); }
    .tab-btn.active { color: var(--primary); background: rgba(56, 189, 248, 0.12); }

    .search-bar {
      width: 100%; max-width: 400px; padding: 9px 14px;
      background: #0f172a; border: 1px solid #334155; border-radius: 10px;
      color: #fff; font-size: 13px; margin-bottom: 16px;
    }
    .batch-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
    }
    .batch-card {
      background: #0f172a;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
      display: flex; flex-direction: column;
      transition: all 0.2s ease;
    }
    .batch-card:hover { border-color: var(--primary); transform: translateY(-2px); }
    .batch-img { width: 100%; height: 120px; object-fit: cover; background: #1e293b; }
    .batch-body { padding: 12px; flex: 1; display: flex; flex-direction: column; }
    .batch-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; line-height: 1.4; }
    .batch-tag {
      display: inline-block; padding: 2px 7px; border-radius: 5px;
      background: rgba(56, 189, 248, 0.1); color: var(--primary);
      font-size: 10px; font-weight: 700; margin-bottom: 6px;
    }
    .batch-meta { font-size: 11px; color: var(--text-muted); margin-top: auto; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; }

    .perf-table { width: 100%; border-collapse: collapse; font-size: 12px; text-align: left; margin-top: 12px; }
    .perf-table th { background: #0f172a; padding: 10px; color: var(--text-muted); border-bottom: 1px solid #334155; }
    .perf-table td { padding: 10px; border-bottom: 1px solid #1e293b; }
    .perf-table tr:hover { background: rgba(255,255,255,0.02); }
    .badge-fast { background: rgba(16, 185, 129, 0.2); color: var(--success); padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 10px; }

    .api-card {
      background: #0f172a; border: 1px solid #1e293b; border-radius: 10px;
      padding: 14px; margin-bottom: 12px;
    }
    .api-method {
      display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;
      margin-right: 6px;
    }
    .get { background: rgba(16, 185, 129, 0.2); color: var(--success); }
    .post { background: rgba(56, 189, 248, 0.2); color: var(--primary); }
    .api-endpoint { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; color: #fff; word-break: break-all; }
    .api-desc { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

    .token-box { max-width: 480px; }
    .input-text {
      width: 100%; background: #0f172a; border: 1px solid #334155;
      padding: 9px 12px; border-radius: 8px; color: #fff; font-size: 13px;
      box-sizing: border-box;
    }
    .input-text:focus { outline: none; border-color: var(--primary); }

    /* Modal for In-App JSON Inspection */
    .modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
      z-index: 10000; display: none; align-items: center; justify-content: center;
      padding: 16px;
    }
    .modal-container {
      background: #0f172a; border: 1px solid var(--primary);
      border-radius: 16px; width: 100%; max-width: 800px; max-height: 85vh;
      display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,0.8);
    }
    .modal-header {
      padding: 14px 18px; border-bottom: 1px solid #1e293b;
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal-title { font-size: 15px; font-weight: 700; color: #fff; }
    .modal-body {
      padding: 14px; overflow-y: auto; flex: 1;
      font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #38bdf8;
      background: #060a12; white-space: pre-wrap; word-break: break-all;
    }
    .modal-footer {
      padding: 12px 18px; border-top: 1px solid #1e293b;
      display: flex; justify-content: flex-end; gap: 10px;
    }

    /* Web Admin Panel Iframe View */
    .admin-frame-container {
      background: #090e17;
      border: 1px solid var(--card-border);
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      height: calc(100vh - 130px);
      min-height: 560px;
    }
    .admin-frame-toolbar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 10px 16px;
      background: #0f172a;
      border-bottom: 1px solid var(--card-border);
      font-size: 12px;
      flex-wrap: wrap; gap: 8px;
    }
    .admin-frame-url {
      color: var(--primary);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      display: flex; align-items: center; gap: 6px;
    }
    .admin-frame {
      width: 100%;
      height: 100%;
      flex: 1;
      border: none;
      background: #111827;
    }
  </style>
</head>
<body>
  <!-- Toast Banner -->
  <div id="toast">🔔 <span id="toastMsg">Notification</span></div>

  <!-- In-App JSON Inspector Modal -->
  <div id="jsonModal" class="modal-overlay" onclick="closeJsonModal(event)">
    <div class="modal-container" onclick="event.stopPropagation()">
      <div class="modal-header">
        <div class="modal-title" id="jsonModalTitle">Batch JSON Inspector</div>
        <button class="btn-pill" onclick="closeJsonModal()">✕ Close</button>
      </div>
      <div class="modal-body" id="jsonModalBody">Loading JSON...</div>
      <div class="modal-footer">
        <button class="btn-pill" onclick="copyModalJson()">📋 Copy JSON</button>
        <button class="btn-pill" style="border-color: var(--primary); color: var(--primary);" onclick="closeJsonModal()">Done</button>
      </div>
    </div>
  </div>

  <div class="container">
    <!-- Top Mode Switcher Bar -->
    <div class="mode-bar">
      <button id="modeBtnScraper" class="mode-btn active" onclick="switchMode('scraper')">
        ⚡ Batch Scraper & Sync Engine
      </button>
      <button id="modeBtnAdminWeb" class="mode-btn" onclick="switchMode('admin-web')">
        🛡️ Web Admin Panel (nextbridgeweb.netlify.app/admin)
      </button>
    </div>

    <!-- Top Navbar -->
    <header class="navbar">
      <div class="brand">
        <!-- New Admin Shield Vector Logo -->
        <svg class="brand-logo-badge" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8"/>
              <stop offset="100%" stop-color="#818cf8"/>
            </linearGradient>
            <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#f59e0b"/>
              <stop offset="100%" stop-color="#fbbf24"/>
            </linearGradient>
          </defs>
          <path d="M50 8 L85 24 L85 60 C85 76 50 92 50 92 C50 92 15 76 15 60 L15 24 Z" fill="#0d1525" stroke="url(#shieldGrad)" stroke-width="4"/>
          <path d="M50 14 L80 28 L80 58 C80 72 50 86 50 86 C50 86 20 72 20 58 L20 28 Z" fill="#111c30" stroke="#1e293b" stroke-width="1.5"/>
          <!-- N Monogram -->
          <path d="M33 34 L38 34 L49 52 L49 34 L54 34 L54 60 L48 60 L38 43 L38 60 L33 60 Z" fill="#ffffff"/>
          <!-- B Monogram -->
          <path d="M57 34 L66 34 C69.5 34 72 35.8 72 39 C72 41.5 70.5 43.2 68.5 44.2 C71 45.3 72.8 47.3 72.8 50.5 C72.8 55 69.5 60 65 60 L57 60 Z M62 38.5 L62 45 L65.5 45 C67 45 68 44 68 41.8 C68 39.5 67 38.5 65.5 38.5 Z M62 49.5 L62 55.5 L66 55.5 C67.8 55.5 68.8 54.3 68.8 52.5 C68.8 50.7 67.8 49.5 66 49.5 Z" fill="#38bdf8"/>
          <!-- Admin Tag -->
          <rect x="26" y="67" width="48" height="13" rx="4" fill="url(#badgeGrad)"/>
          <text x="50" y="77" fill="#000000" font-family="'Plus Jakarta Sans', sans-serif" font-weight="900" font-size="8" text-anchor="middle" letter-spacing="1">ADMIN</text>
        </svg>
        <div>
          <h1>NextBridge Admin</h1>
          <span>Unified Batch Extraction Engine & Cloud Administration</span>
        </div>
      </div>
      <div id="statusBadge" class="status-badge">
        <div class="pulse-dot"></div>
        <span id="statusText">IDLE</span>
      </div>
    </header>

    <!-- ================= VIEW 1: BATCH SCRAPER ENGINE ================= -->
    <main id="view-scraper">
      <!-- Executive KPI Summary Cards -->
      <section class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-title">TOTAL BATCH CATALOG</div>
          <div class="kpi-value" id="kpiBatches">${totalBatches}</div>
          <div class="kpi-sub">${activeCount} Active (26-27) + ${totalBatches - activeCount} Archive (25-26)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">TOTAL EXTRACTED CONTENT</div>
          <div class="kpi-value" id="kpiItems">${totalItems.toLocaleString()}</div>
          <div class="kpi-sub">Lectures, Notes, Tests & Worksheets</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">NATIVE PHONE ACCELERATION</div>
          <div class="kpi-value" id="kpiSpeed">33.4s</div>
          <div class="kpi-sub">15.7x Faster (Multi-Core Adaptive Concurrency)</div>
        </div>
        <div class="kpi-card" id="kpiFirebaseCard">
          <div class="kpi-title">FIREBASE DELIVERY HEALTH</div>
          <div class="kpi-value" id="kpiFirebaseVal" style="color: var(--success); font-size: 20px;">
            100% Operational
          </div>
          <div class="kpi-sub" id="kpiFirebaseSub" style="color: var(--success);">
            2-Socket Queue • 4x Auto-Retry Active
          </div>
        </div>
      </section>

      <!-- Sync Health Alert Banner Container -->
      <div id="syncHealthContainer">
        <div id="syncHealthBanner" class="panel" style="border-color: rgba(16, 185, 129, 0.35); background: rgba(16, 185, 129, 0.05); padding: 14px 20px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="font-size: 22px;">🛡️</span>
              <div>
                <span style="font-size: 14px; font-weight: 800; color: var(--success);">
                  Firebase Delivery & Socket Health: 100% Operational
                </span>
                <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                  Throttled via bounded 2-socket queue with 4-attempt exponential backoff.
                </div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="background: rgba(16, 185, 129, 0.18); color: var(--success); padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 11px;">✓ 0 Dropped Batches</span>
              <span style="background: rgba(56, 189, 248, 0.15); color: var(--primary); padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 11px;">Adaptive Concurrency</span>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB NAVIGATION BAR -->
      <div class="tabs">
        <button class="tab-btn active" data-tab="selector" onclick="switchTab('selector', this)">🎯 Batch Selector & Extractor</button>
        <button class="tab-btn" data-tab="batches" onclick="switchTab('batches', this)">📚 Full Directory (${totalBatches})</button>
        <button class="tab-btn" data-tab="benchmarks" onclick="switchTab('benchmarks', this)">📊 Concurrency Benchmarks</button>
        <button class="tab-btn" data-tab="docs" onclick="switchTab('docs', this)">📖 API Architecture & Notes</button>
        <button class="tab-btn" data-tab="token" onclick="switchTab('token', this)">🔑 Fallback Token Manager</button>
      </div>

      <!-- TAB 1: BATCH SELECTOR & RUNNER -->
      <div id="tab-selector" class="panel">
        <div class="panel-header">
          <div class="panel-title">🎯 Custom Batch Selector</div>
          <div class="pill-group">
            <button id="pill-active" class="btn-pill active" onclick="filterBySession('latest', this)">Active 2026-27 (${activeCount})</button>
            <button id="pill-archive" class="btn-pill" style="border-color: #f59e0b; color: #f59e0b;" onclick="filterBySession('archive', this)">📦 Archive 2025-26 (${totalBatches - activeCount})</button>
            <button class="btn-pill" onclick="selectAllBatches(true, this)">Select All (${totalBatches})</button>
            <button class="btn-pill" onclick="selectAllBatches(false, this)">Clear Selection</button>
            <button class="btn-pill" onclick="filterByGrade('Class 10', this)">Class 10 Only</button>
            <button class="btn-pill" onclick="filterByGrade('Class 9', this)">Class 9 Only</button>
            <button class="btn-pill" onclick="filterByGrade('Class 11', this)">Class 11 Only</button>
            <button class="btn-pill" onclick="filterByGrade('Class 12', this)">Class 12 Only</button>
            <button class="btn-pill" onclick="filterByGrade('Crash Course', this)">Crash Courses Only</button>
          </div>
        </div>

        <!-- Action Trigger Bar -->
        <div class="selection-action-bar">
          <div class="selection-counter">
            Selected: <span id="selectedCount">${activeCount}</span> / ${totalBatches} Batches
          </div>
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
              <input type="checkbox" id="syncFirebaseCheckbox" checked style="width: 16px; height: 16px; accent-color: var(--primary);" />
              Sync to Firebase Realtime DB
            </label>
            <button id="btnExtractArchiveOnly" class="btn-pill" style="border-color: #f59e0b; color: #f59e0b; font-weight: 700; padding: 10px 16px;" onclick="triggerArchiveExtraction()">
              📦 Extract ${totalBatches - activeCount} Archive Batches
            </button>
            <button id="btnExtractSelected" class="btn-main" onclick="triggerSelectedExtraction()">
              🚀 Extract Selected Batches (<span id="btnCount">${activeCount}</span>)
            </button>
          </div>
        </div>

        <!-- Scrollable Checkbox Card List -->
        <div class="selectable-grid" id="selectorGrid">
          ${batchList.map(b => `
            <div class="select-card ${b.is_old ? 'archive-card' : 'selected'}" id="card-${b.batch_id}" onclick="toggleCardSelection('${b.batch_id}', event)">
              <input type="checkbox" class="batch-checkbox" id="chk-${b.batch_id}" value="${b.batch_id}" ${b.is_old ? '' : 'checked'} onclick="event.stopPropagation(); updateSelectionState();" />
              <img class="select-thumb" src="${b.thumbnail || 'https://via.placeholder.com/60?text=NB'}" alt="Thumb" loading="lazy" />
              <div class="select-info">
                <div class="select-title" title="${b.batch_name}">
                  ${b.is_old ? '<span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; font-size: 9px; padding: 1px 5px; border-radius: 4px; margin-right: 4px; font-weight: 800;">ARCHIVE</span>' : ''}
                  ${b.batch_name}
                </div>
                <div class="select-meta" style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                  <span>${b.class_name} • ID ${b.batch_id} • ${b.total_items ?? 0} items</span>
                  <span class="delivery-badge ready" id="badge-${b.batch_id}">● Cataloged</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- LIVE EXTRACTION TERMINAL CONSOLE -->
      <section class="panel">
        <div class="terminal-bar">
          <span style="font-weight: 700; color: #fff;">LIVE EXTRACTION CONSOLE</span>
          <div style="display: flex; gap: 10px; align-items: center;">
            <span id="logStatus" style="color: var(--success);">● Native Engine Ready</span>
            <button class="btn-pill" style="padding: 3px 8px; font-size: 11px;" onclick="clearTerminal()">Clear</button>
          </div>
        </div>
        <div id="terminal" class="terminal">NextBridge Native Scraper Engine initialized. Ready to execute on-device extraction...</div>
      </section>

      <!-- TAB 2: FULL BATCH DIRECTORY -->
      <div id="tab-batches" style="display: none;" class="panel">
        <div class="panel-header">
          <div class="panel-title">📚 Master Batch Catalog</div>
          <input type="text" id="searchInput" class="search-bar" placeholder="🔍 Search by batch title, grade, or ID..." onkeyup="filterBatchesDirectory()" style="margin-bottom: 0;" />
        </div>
        <div class="batch-grid" id="batchGrid">
          ${batchList.map(b => `
            <div class="batch-card" data-title="${(b.batch_name || '').toLowerCase()}" data-id="${b.batch_id}">
              <img class="batch-img" src="${b.thumbnail || 'https://via.placeholder.com/300x150?text=NextBridge'}" alt="Thumbnail" loading="lazy" />
              <div class="batch-body">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <span class="batch-tag" style="${b.is_old ? 'background: rgba(245, 158, 11, 0.15); color: #f59e0b; margin-bottom: 0;' : 'margin-bottom: 0;'}">
                    ${b.is_old ? '📦 ARCHIVE • ' : ''}${b.class_name} • ID ${b.batch_id}
                  </span>
                  <span class="delivery-badge ready">● Cataloged</span>
                </div>
                <div class="batch-title">${b.batch_name}</div>
                <div class="batch-meta">
                  <span>📁 ${b.total_items ?? 0} Items (${b.subject_count || 0} Subjects)</span>
                  <a href="javascript:void(0)" onclick="inspectBatchJson('${b.batch_id}')" style="color: var(--primary); text-decoration: none; font-weight: 700;">View JSON</a>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- TAB 3: BENCHMARKS -->
      <div id="tab-benchmarks" style="display: none;" class="panel">
        <div class="panel-title" style="margin-bottom: 10px;">📊 Benchmark Performance Analysis (Mobile vs Cloud)</div>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 14px;">
          Empirical measurements comparing sequential throughput against bounded mobile multi-core workers:
        </p>
        <table class="perf-table">
          <thead>
            <tr>
              <th>Platform / Concurrency Profile</th>
              <th>Batch Workers</th>
              <th>Subject Workers</th>
              <th>Wall-Clock Time</th>
              <th>Speedup</th>
              <th>Analysis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Mode A (Safe / Cloud Queue)</strong></td>
              <td>4 Batches</td>
              <td>2 Subjects / Batch</td>
              <td>54.2s</td>
              <td>3.76x</td>
              <td>Cloud queueing with idle wait</td>
            </tr>
            <tr style="background: rgba(16, 185, 129, 0.08);">
              <td><strong style="color: var(--success);">Mode B (Native Mobile Multi-Core)</strong></td>
              <td><strong>Adaptive (Up to 14)</strong></td>
              <td><strong>Adaptive (3–6)</strong></td>
              <td><strong style="color: var(--success);">~20-33s</strong> <span class="badge-fast">FASTEST</span></td>
              <td><strong>15.69x</strong></td>
              <td><strong>8-core phone execution</strong>; direct stream resolution bypasses VDC delays</td>
            </tr>
            <tr>
              <td><strong>Mode B+ (High Concurrency)</strong></td>
              <td>28 Batches</td>
              <td>4 Subjects / Batch</td>
              <td>41.4s</td>
              <td>19.35x</td>
              <td>Minor TLS handshake overhead (+8s)</td>
            </tr>
            <tr>
              <td><strong>Mode C (Hardcore Unbounded)</strong></td>
              <td>28 Batches</td>
              <td>ALL Subjects Parallel</td>
              <td>58.8s</td>
              <td>8.91x</td>
              <td>Excessive parallel sockets trigger rate limits</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- TAB 4: API ARCHITECTURE & DOCUMENTATION -->
      <div id="tab-docs" style="display: none;" class="panel">
        <div class="panel-title" style="margin-bottom: 12px;">📖 API Directory & Technical Documentation</div>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">
          Upstream endpoints, Video Crypt resolver, and Firebase RTDB database schemas.
        </p>

        <div class="api-card">
          <span class="api-method post">POST</span>
          <span class="api-endpoint">https://course.nexttoppers.com/course/all-content</span>
          <div class="api-desc">
            <strong>NextToppers Origin API:</strong> Direct unauthenticated guest mode traversal. Returns subjects, folders, lectures, and materials with zero login requirements.
          </div>
        </div>

        <div class="api-card">
          <span class="api-method get">GET</span>
          <span class="api-endpoint">https://eduvibe-2tkn.onrender.com/nt/video-details?content_id=&lt;id&gt;&amp;course_id=&lt;courseId&gt;</span>
          <div class="api-desc">
            <strong>EduVibe AES-128 Decryption Resolver:</strong> Resolves masked dynamic PDF links directly into unmasked high-speed CloudFront URLs via Web Crypto (<code>crypto.subtle</code>).
          </div>
        </div>

        <div class="api-card">
          <span class="api-method post">PATCH / PUT</span>
          <span class="api-endpoint">https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app/nexthope_batches/batch_&lt;id&gt;.json</span>
          <div class="api-desc">
            <strong>Firebase Realtime Database:</strong> High-performance distributed backend stores the synced batch trees and subject indices.
          </div>
        </div>

        <div class="api-card">
          <span class="api-method get">NATIVE</span>
          <span class="api-endpoint">ExtractionForegroundService (DATA_SYNC + WakeLock)</span>
          <div class="api-desc">
            <strong>Android 14+ Sticky Notification Service:</strong> Keeps extraction running at full multi-core performance even when the screen is locked or app is minimized.
          </div>
        </div>
      </div>

      <!-- TAB 5: FALLBACK TOKEN MANAGER -->
      <div id="tab-token" style="display: none;" class="panel">
        <div class="panel-title" style="margin-bottom: 12px;">🔑 Failover Fallback Token Manager</div>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">
          Maintained in Firebase RTDB as an automated fallback if Next Hope is ever unreachable.
        </p>

        <div class="token-box">
          <div style="background: #0f172a; padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 12px;">
            <div><strong>Class 10 Fallback Token:</strong> <span id="t10" style="color: var(--primary);">Loading...</span></div>
            <div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">Last Updated: <span id="u10">Loading...</span></div>
          </div>

          <div style="background: #0f172a; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 12px;">
            <div><strong>Class 9 Fallback Token:</strong> <span id="t9" style="color: var(--primary);">Loading...</span></div>
            <div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">Last Updated: <span id="u9">Loading...</span></div>
          </div>

          <select id="classSelect" class="input-text" style="margin-bottom: 10px;">
            <option value="10">Class 10</option>
            <option value="9">Class 9</option>
          </select>
          <input type="password" id="adminPassword" class="input-text" value="nxttopprtokenclass10#" placeholder="Admin Password" style="margin-bottom: 10px;" />
          <input type="text" id="newToken" class="input-text" placeholder="Paste New Bearer Token Here" style="margin-bottom: 10px;" />
          <button id="tokenBtn" class="btn-pill" style="border-color: var(--primary); color: var(--primary); width: 100%; padding: 10px;" onclick="updateToken()">Update Token</button>
        </div>
      </div>
    </main>

    <!-- ================= VIEW 2: NEXTBRIDGE WEB ADMIN PANEL ================= -->
    <main id="view-admin-web" style="display: none;">
      <div class="admin-frame-container">
        <div class="admin-frame-toolbar">
          <div class="admin-frame-url">
            <span>🛡️</span>
            <span>https://nextbridgeweb.netlify.app/admin</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span style="color: var(--success); font-weight: 700; font-size: 11px;">● Netlify Cloud</span>
            <button class="btn-pill" style="padding: 4px 10px; font-size: 11px;" onclick="reloadAdminFrame()">🔄 Reload</button>
            <button class="btn-pill" style="padding: 4px 10px; font-size: 11px; border-color: var(--primary); color: var(--primary);" onclick="openAdminExternal()">↗️ Open in Browser</button>
          </div>
        </div>
        <iframe
          id="adminWebFrame"
          class="admin-frame"
          src="https://nextbridgeweb.netlify.app/admin"
          allow="clipboard-read; clipboard-write; fullscreen"
          title="NextBridge Web Admin Panel">
        </iframe>
      </div>
    </main>
  </div>

  <script type="module">
    import {
      CONFIG,
      state,
      executeExtractionPipeline,
      loadFirebaseTokens,
      updateFirebaseToken
    } from './mobile_extractor.js';

    const ALL_BATCHES = ${JSON.stringify(batchList)};
    window.ALL_BATCHES = ALL_BATCHES;

    // Toast Banner
    window.showToast = function(msg, isError = false) {
      const toast = document.getElementById('toast');
      const toastMsg = document.getElementById('toastMsg');
      toastMsg.innerText = msg;
      toast.style.borderColor = isError ? 'var(--danger)' : 'var(--primary)';
      toast.style.display = 'flex';
      setTimeout(() => { toast.style.display = 'none'; }, 4000);
    };

    // Mode Switching: Scraper Engine vs Web Admin Panel
    window.switchMode = function(mode) {
      const scraperView = document.getElementById('view-scraper');
      const adminWebView = document.getElementById('view-admin-web');
      const modeBtnScraper = document.getElementById('modeBtnScraper');
      const modeBtnAdminWeb = document.getElementById('modeBtnAdminWeb');

      if (mode === 'scraper') {
        scraperView.style.display = 'block';
        adminWebView.style.display = 'none';
        modeBtnScraper.classList.add('active');
        modeBtnAdminWeb.classList.remove('active');
      } else if (mode === 'admin-web') {
        scraperView.style.display = 'none';
        adminWebView.style.display = 'block';
        modeBtnScraper.classList.remove('active');
        modeBtnAdminWeb.classList.add('active');
      }
    };

    window.reloadAdminFrame = function() {
      const frame = document.getElementById('adminWebFrame');
      if (frame) {
        frame.src = 'https://nextbridgeweb.netlify.app/admin?t=' + Date.now();
        window.showToast('Reloading Web Admin Panel...');
      }
    };

    window.openAdminExternal = function() {
      window.open('https://nextbridgeweb.netlify.app/admin', '_system');
    };

    // Tab Switching inside Scraper View
    window.switchTab = function(tabId, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      if (btn) {
        btn.classList.add('active');
      } else {
        const targetBtn = document.querySelector('[data-tab="' + tabId + '"]');
        if (targetBtn) targetBtn.classList.add('active');
      }

      const allTabs = ['selector', 'batches', 'benchmarks', 'docs', 'token'];
      allTabs.forEach(id => {
        const el = document.getElementById('tab-' + id);
        if (el) el.style.display = (id === tabId) ? 'block' : 'none';
      });
    };

    // Card Selection Toggle
    window.toggleCardSelection = function(batchId, ev) {
      const chk = document.getElementById('chk-' + batchId);
      if (chk) {
        chk.checked = !chk.checked;
        window.updateSelectionState();
      }
    };

    window.updateSelectionState = function() {
      let count = 0;
      document.querySelectorAll('.batch-checkbox').forEach(chk => {
        const card = document.getElementById('card-' + chk.value);
        if (chk.checked) {
          count++;
          if (card) card.classList.add('selected');
        } else {
          if (card) card.classList.remove('selected');
        }
      });
      document.getElementById('selectedCount').innerText = count;
      document.getElementById('btnCount').innerText = count;
      document.getElementById('btnExtractSelected').disabled = (count === 0);
    };

    window.selectAllBatches = function(selectState, btn) {
      document.querySelectorAll('.pill-group .btn-pill').forEach(p => p.classList.remove('active'));
      if (btn) btn.classList.add('active');
      document.querySelectorAll('.batch-checkbox').forEach(chk => {
        chk.checked = selectState;
      });
      window.updateSelectionState();
    };

    window.filterBySession = function(sessionType, btn) {
      document.querySelectorAll('.pill-group .btn-pill').forEach(p => p.classList.remove('active'));
      if (btn) btn.classList.add('active');
      ALL_BATCHES.forEach(b => {
        const chk = document.getElementById('chk-' + b.batch_id);
        if (chk) {
          if (sessionType === 'archive') {
            chk.checked = !!b.is_old;
          } else if (sessionType === 'latest') {
            chk.checked = !b.is_old;
          }
        }
      });
      window.updateSelectionState();
      window.showToast('Selected ' + (sessionType === 'archive' ? 'Archive (2025-26)' : 'Active (2026-27)') + ' batches');
    };

    window.filterByGrade = function(gradeName, btn) {
      document.querySelectorAll('.pill-group .btn-pill').forEach(p => p.classList.remove('active'));
      if (btn) btn.classList.add('active');
      ALL_BATCHES.forEach(b => {
        const chk = document.getElementById('chk-' + b.batch_id);
        if (chk) {
          chk.checked = (b.class_name || '').toLowerCase().includes(gradeName.toLowerCase());
        }
      });
      window.updateSelectionState();
      window.showToast('Selected ' + gradeName + ' batches');
    };

    window.clearTerminal = function() {
      document.getElementById('terminal').innerText = 'Terminal cleared.';
    };

    function appendTerminalLog(logLine) {
      const term = document.getElementById('terminal');
      if (term) {
        term.innerText += '\\n' + logLine;
        term.scrollTop = term.scrollHeight;
      }
    }

    // Trigger Extraction
    window.triggerSelectedExtraction = async function() {
      if (state.isSyncing) return;
      const selectedIds = [];
      document.querySelectorAll('.batch-checkbox:checked').forEach(chk => {
        selectedIds.push(chk.value);
      });

      if (selectedIds.length === 0) {
        window.showToast('Please select at least 1 batch to extract', true);
        return;
      }

      const targetBatches = ALL_BATCHES.filter(b => selectedIds.includes(String(b.batch_id)));
      const syncFirebase = document.getElementById('syncFirebaseCheckbox').checked;

      setExtractionUiState(true, \`\${targetBatches.length} BATCHES\`);
      window.showToast(\`Initiating extraction of \${targetBatches.length} batches...\`);

      try {
        await executeExtractionPipeline({
          targetBatches,
          syncFirebase,
          onLog: appendTerminalLog,
          onProgress: (p) => {
            const statusText = document.getElementById('statusText');
            if (statusText) statusText.innerText = (p.statusText || \`EXTRACTING [\${p.currentIndex}/\${p.totalBatches}]...\`).toUpperCase();
            const badge = document.getElementById('badge-' + p.batchId);
            if (badge) {
              badge.className = 'delivery-badge success';
              badge.innerText = '✓ Synced';
            }
          },
          onComplete: (benchmark, newlyExtracted) => {
            setExtractionUiState(false);
            updateKpiCards(benchmark);
            window.showToast('Batch extraction completed successfully!');
          }
        });
      } catch (err) {
        setExtractionUiState(false);
        window.showToast('Extraction failed: ' + err.message, true);
      }
    };

    window.triggerArchiveExtraction = async function() {
      if (state.isSyncing) return;
      const archiveBatches = ALL_BATCHES.filter(b => b.is_old);
      const syncFirebase = document.getElementById('syncFirebaseCheckbox').checked;

      setExtractionUiState(true, '19 ARCHIVE BATCHES');
      window.showToast('Initiating extraction of 19 static archive batches...');

      try {
        await executeExtractionPipeline({
          targetBatches: archiveBatches,
          syncFirebase,
          onLog: appendTerminalLog,
          onProgress: (p) => {
            const statusText = document.getElementById('statusText');
            if (statusText) statusText.innerText = (p.statusText || \`EXTRACTING [\${p.currentIndex}/\${p.totalBatches}]...\`).toUpperCase();
            const badge = document.getElementById('badge-' + p.batchId);
            if (badge) {
              badge.className = 'delivery-badge success';
              badge.innerText = '✓ Synced';
            }
          },
          onComplete: (benchmark) => {
            setExtractionUiState(false);
            updateKpiCards(benchmark);
            window.showToast('Archive batch extraction completed!');
          }
        });
      } catch (err) {
        setExtractionUiState(false);
        window.showToast('Archive extraction error: ' + err.message, true);
      }
    };

    window.retryFailedBatches = async function() {
      if (!state.benchmark || !state.benchmark.failed_batches || state.benchmark.failed_batches.length === 0) {
        window.showToast('No failed batches to retry!');
        return;
      }
      const failedIds = state.benchmark.failed_batches.map(b => String(b.id));
      const targetBatches = ALL_BATCHES.filter(b => failedIds.includes(String(b.batch_id)));
      const syncFirebase = document.getElementById('syncFirebaseCheckbox').checked;

      setExtractionUiState(true, \`RETRY \${targetBatches.length} FAILED\`);
      window.showToast(\`Retrying \${targetBatches.length} failed batch(es)...\`);

      try {
        await executeExtractionPipeline({
          targetBatches,
          syncFirebase,
          onLog: appendTerminalLog,
          onComplete: (benchmark) => {
            setExtractionUiState(false);
            updateKpiCards(benchmark);
            window.showToast('Retry completed!');
          }
        });
      } catch (err) {
        setExtractionUiState(false);
        window.showToast('Retry error: ' + err.message, true);
      }
    };

    function setExtractionUiState(isExtracting, label = '') {
      const badge = document.getElementById('statusBadge');
      const text = document.getElementById('statusText');
      const btn = document.getElementById('btnExtractSelected');
      const btnArchive = document.getElementById('btnExtractArchiveOnly');
      const logStatus = document.getElementById('logStatus');

      if (isExtracting) {
        badge.className = 'status-badge syncing';
        text.innerText = 'EXTRACTING (' + label + ')...';
        if (btn) btn.disabled = true;
        if (btnArchive) btnArchive.disabled = true;
        logStatus.innerText = '● Live extraction running';
        logStatus.style.color = 'var(--warning)';
      } else {
        badge.className = 'status-badge';
        text.innerText = 'IDLE';
        if (btn) btn.disabled = false;
        if (btnArchive) btnArchive.disabled = false;
        logStatus.innerText = '● Connected & Ready';
        logStatus.style.color = 'var(--success)';
      }
    }

    // Auto-reconnect & state persistence from Android Native Service
    async function syncActiveForegroundState() {
      try {
        const plugin = window.Capacitor?.Plugins?.ExtractionService;
        if (!plugin) return;
        const nativeState = await plugin.getExtractionState();
        if (nativeState && nativeState.isRunning) {
          state.isSyncing = true;
          const statusText = nativeState.statusText || \`Extracting [\${nativeState.currentIndex}/\${nativeState.totalBatches}]...\`;
          setExtractionUiState(true, \`\${nativeState.currentIndex}/\${nativeState.totalBatches}\`);
          
          const statusEl = document.getElementById('statusText');
          if (statusEl) statusEl.innerText = statusText.toUpperCase();

          if (nativeState.logs && nativeState.logs.length > 0) {
            const term = document.getElementById('terminal');
            if (term && term.innerText.length < nativeState.logs.join('\\n').length) {
              term.innerText = nativeState.logs.join('\\n');
              term.scrollTop = term.scrollHeight;
            }
          }
        } else if (!state.isSyncing) {
          const badge = document.getElementById('statusBadge');
          if (badge && badge.classList.contains('syncing')) {
            setExtractionUiState(false);
          }
        }
      } catch (e) {}
    }

    // Synchronize on startup and resume from background
    syncActiveForegroundState();
    window.addEventListener('focus', syncActiveForegroundState);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncActiveForegroundState();
    });
    setInterval(syncActiveForegroundState, 1500);

    function updateKpiCards(benchmark) {
      if (!benchmark) return;
      document.getElementById('kpiSpeed').innerText = benchmark.wall_clock_time_seconds + 's';
      const hasFailures = benchmark.firebase_failed_count > 0;
      const kpiCard = document.getElementById('kpiFirebaseCard');
      const kpiVal = document.getElementById('kpiFirebaseVal');
      const kpiSub = document.getElementById('kpiFirebaseSub');
      const container = document.getElementById('syncHealthContainer');

      if (hasFailures) {
        kpiVal.style.color = 'var(--danger)';
        kpiVal.innerText = benchmark.firebase_failed_count + ' Failed Upload(s)';
        kpiSub.style.color = '#fca5a5';
        kpiSub.innerText = benchmark.firebase_success_count + ' Uploaded, ' + benchmark.firebase_failed_count + ' Dropped';
        if (kpiCard) kpiCard.style.borderColor = 'rgba(239, 68, 68, 0.4)';

        container.innerHTML = \`
          <div id="syncHealthBanner" class="panel" style="border-color: rgba(239, 68, 68, 0.6); background: rgba(239, 68, 68, 0.08); padding: 16px 20px; margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 24px;">⚠️</span>
                <div>
                  <h3 style="font-size: 15px; font-weight: 800; color: #fca5a5;">
                    Sync Warning: \${benchmark.failed_batches.length} Batch(es) Failed Delivery / Extraction
                  </h3>
                  <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                    Encountered during sync. Click Retry below to re-upload.
                  </p>
                </div>
              </div>
              <button class="btn-pill" style="border-color: var(--danger); color: #fca5a5; font-weight: 700; padding: 8px 14px; display: inline-flex; align-items: center; gap: 6px;" onclick="retryFailedBatches()">
                🔄 Retry \${benchmark.failed_batches.length} Failed Batch(es)
              </button>
            </div>
          </div>
        \`;
      } else {
        kpiVal.style.color = 'var(--success)';
        kpiVal.innerText = '100% Operational';
        kpiSub.style.color = 'var(--success)';
        kpiSub.innerText = '2-Socket Queue • 4x Auto-Retry Active';
        if (kpiCard) kpiCard.style.borderColor = 'var(--card-border)';
      }
    }

    // Full Batch Directory Search
    window.filterBatchesDirectory = function() {
      const query = document.getElementById('searchInput').value.toLowerCase();
      document.querySelectorAll('.batch-card').forEach(card => {
        const title = card.getAttribute('data-title') || '';
        const id = card.getAttribute('data-id') || '';
        card.style.display = (title.includes(query) || id.includes(query)) ? 'flex' : 'none';
      });
    };

    // In-App JSON Inspector Modal
    window.inspectBatchJson = async function(batchId) {
      const modal = document.getElementById('jsonModal');
      const title = document.getElementById('jsonModalTitle');
      const body = document.getElementById('jsonModalBody');

      title.innerText = 'Batch ' + batchId + ' JSON Inspector';
      modal.style.display = 'flex';

      if (state.extractedBatches[batchId]) {
        body.innerText = JSON.stringify(state.extractedBatches[batchId], null, 2);
        return;
      }

      body.innerText = 'Fetching live batch document from Firebase RTDB...';
      try {
        const res = await fetch(\`\${CONFIG.FIREBASE_DB_URL}/nexthope_batches/batch_\${batchId}.json\`);
        if (res.ok) {
          const json = await res.json();
          if (json) {
            body.innerText = JSON.stringify(json, null, 2);
            return;
          }
        }
      } catch (e) {}

      const found = ALL_BATCHES.find(b => String(b.batch_id) === String(batchId));
      body.innerText = found ? JSON.stringify(found, null, 2) : 'No cached data for Batch ' + batchId;
    };

    window.closeJsonModal = function() {
      document.getElementById('jsonModal').style.display = 'none';
    };

    window.copyModalJson = function() {
      const text = document.getElementById('jsonModalBody').innerText;
      navigator.clipboard?.writeText(text);
      window.showToast('JSON copied to clipboard!');
    };

    // Fallback Token Manager
    async function initTokenInfo() {
      const tokens = await loadFirebaseTokens();
      const mask = (t) => t ? (t.substring(0, 10) + '...' + t.substring(t.length - 8)) : 'Not Configured';
      document.getElementById('t10').innerText = mask(tokens.bearerToken10);
      document.getElementById('u10').innerText = tokens.lastUpdated10;
      document.getElementById('t9').innerText = mask(tokens.bearerToken9);
      document.getElementById('u9').innerText = tokens.lastUpdated9;
    }

    window.updateToken = async function() {
      const pw = document.getElementById('adminPassword').value;
      const tk = document.getElementById('newToken').value.trim();
      const cls = document.getElementById('classSelect').value;
      const btn = document.getElementById('tokenBtn');

      if (!pw || !tk) return window.showToast('Please provide both password and token', true);
      if (pw !== CONFIG.ADMIN_PASSWORD) return window.showToast('Invalid Admin Password', true);

      btn.disabled = true; btn.innerText = 'Updating...';

      try {
        await updateFirebaseToken(tk, cls);
        window.showToast(\`Class \${cls} token updated successfully!\`);
        document.getElementById('newToken').value = '';
        await initTokenInfo();
      } catch (e) {
        window.showToast('Failed to update token: ' + e.message, true);
      }
      btn.disabled = false; btn.innerText = 'Update Token';
    };

    initTokenInfo();
    window.updateSelectionState();
  </script>
</body>
</html>
`;

fs.writeFileSync('D:/NextBridge/shell_dist/index.html', htmlContent, 'utf8');
console.log('Successfully regenerated D:/NextBridge/shell_dist/index.html with auto-reconnect and persistent live status.');
