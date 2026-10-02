import React, { useState, useEffect, useRef } from 'react';
import { 
  Key, 
  ShieldCheck, 
  ShieldAlert, 
  RefreshCw, 
  CheckCircle, 
  Clock, 
  User, 
  Copy, 
  Check, 
  Trash2, 
  PlayCircle,
  Database,
  ExternalLink,
  Layers,
  Zap,
  Play,
  Square,
  AlertCircle,
  FileText,
  Activity,
  Cpu,
  Radio,
  CheckCircle2,
  List
} from 'lucide-react';
import defaultBatchList from '../assets/batch_list.json';

const FIREBASE_DB_URL = 'https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app';

const PW_GATEWAYS = [
  'https://nextbridgeapi.adsbackend01.workers.dev/pw/api/data',
  'https://nextbridgeapi.adsbackend04.workers.dev/pw/api/data',
  'https://nextbridgeapi.adsbackend05.workers.dev/pw/api/data',
  'https://nextbridge-pw-gateway.nxttopper-deploy.workers.dev/api/data',
  'https://nexthope-pw.space-z.ai/api/data'
];

const PW_BATCHES = defaultBatchList.filter(b => b.batch_id?.startsWith('pw_') || b.pw_batch_id || b.provider === 'Physics Wallah');

function parseJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (_) {
    return null;
  }
}

// Resilient RPC caller cycling across multi-edge gateways
async function callRpc(action, params = {}) {
  let lastError = null;
  for (const gw of PW_GATEWAYS) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(gw, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params, method: 'GET' }),
        signal: controller.signal
      });
      clearTimeout(tid);
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.success === false) continue;
      if (json && json.data !== undefined) return json.data;
      return json;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All gateways unreachable');
}

// Concurrency pool helper
async function pMap(items, fn, concurrency = 4) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.min(concurrency, items.length || 1)).fill(null).map(async () => {
    while (idx < items.length) {
      const current = idx++;
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

export default function AdminPwAuthPanel() {
  // ── Auth Data State ──
  const [authData, setAuthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cookieInput, setCookieInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // ── Live Stream Test State ──
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // ── Cached Signatures State ──
  const [cachedSignatures, setCachedSignatures] = useState([]);
  const [loadingSignatures, setLoadingSignatures] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // ── Sync & Key Resolution State ──
  const [syncMode, setSyncMode] = useState('smart'); // 'smart' | 'full' | 'keys_only'
  const [selectedBatchScope, setSelectedBatchScope] = useState('all'); // 'all' | batch_id
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({
    percent: 0,
    currentBatch: '',
    statusText: 'Ready',
    scannedBatches: 0,
    chaptersProcessed: 0,
    newLecturesFound: 0,
    keysResolved: 0,
    dbUpdates: 0
  });
  const [consoleLogs, setConsoleLogs] = useState([]);
  const consoleContainerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // ── Auto Sync Config State ──
  const [autoSyncConfig, setAutoSyncConfig] = useState({
    enabled: true,
    intervalMins: 30,
    lastRun: null
  });
  const [savingAutoSync, setSavingAutoSync] = useState(false);
  const [syncAuditLogs, setSyncAuditLogs] = useState([]);

  // Fetch Auth & Signatures
  const fetchAuthData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/pw_auth.json`);
      if (res.ok) {
        const data = await res.json();
        setAuthData(data);
        if (data?.cookie) {
          setCookieInput(data.cookie);
        }
      }
    } catch (err) {
      console.error('Failed to load pw_auth from Firebase:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSignatures = async () => {
    setLoadingSignatures(true);
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/pw_signatures.json`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          const list = Object.entries(data).map(([folder, val]) => ({
            folder,
            updatedAt: val?.updatedAt || 0,
            hasSig: Boolean(val?.signedQuery)
          })).sort((a, b) => b.updatedAt - a.updatedAt);
          setCachedSignatures(list);
        }
      }
    } catch (err) {
      console.error('Failed to fetch pw_signatures:', err);
    } finally {
      setLoadingSignatures(false);
    }
  };

  const fetchAutoSyncConfig = async () => {
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/system_config/pw_auto_sync.json`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setAutoSyncConfig(prev => ({
            ...prev,
            ...data
          }));
        }
      }
    } catch (_) {}
  };

  const fetchSyncAuditLogs = async () => {
    try {
      const res = await fetch(`${FIREBASE_DB_URL}/pw_sync_logs.json?shallow=false&orderBy="$key"&limitToLast=8`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          const list = Object.entries(data).map(([id, val]) => ({
            id,
            ...val
          })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          setSyncAuditLogs(list);
        }
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchAuthData();
    fetchSignatures();
    fetchAutoSyncConfig();
    fetchSyncAuditLogs();
  }, []);

  // Auto-scroll console strictly within its container (prevents window jumping)
  useEffect(() => {
    if (consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [consoleLogs]);

  const addLog = (type, text) => {
    const time = new Date().toLocaleTimeString();
    setConsoleLogs(prev => [...prev.slice(-300), { id: Math.random(), time, type, text }]);
  };

  // ── Save Auth Cookie ──
  const handleSaveCookie = async (e) => {
    e.preventDefault();
    if (!cookieInput.trim()) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const raw = cookieInput.trim();
      const anonMatch = raw.match(/anon_id=([0-9a-fA-F-]+)/);
      const anon_id = anonMatch ? anonMatch[1] : '';

      const payload = {
        cookie: raw,
        anon_id,
        updatedAt: Date.now(),
        updatedBy: 'Admin (Web Panel)'
      };

      const res = await fetch(`${FIREBASE_DB_URL}/pw_auth.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setAuthData(payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      addLog('success', 'PW Auth session cookie updated in Firebase RTDB');
    } catch (err) {
      setSaveError(err.message || 'Failed to save auth cookie');
      addLog('error', `Failed to save auth cookie: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Test Stream Playback ──
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      addLog('info', 'Testing playback & DRM resolution on verification lecture...');
      const res = await callRpc('parcham_vid', {
        batchId: '6a071d17f84ddfb496a59f76',
        subjectId: 'physics-095174',
        childId: '6a4a01c39d5c6e39e375d9c4'
      });

      if (res && res.url) {
        setTestResult({
          success: true,
          message: 'Playback Stream Verified! CloudFront wildcard signature and DRM ClearKeys retrieved successfully.',
          details: {
            manifest: res.url,
            clearKeys: res.clearKeys ? Object.keys(res.clearKeys).length + ' Key(s)' : 'None (Open Stream)',
            time: new Date().toLocaleTimeString()
          }
        });
        addLog('success', `Test verified: Stream signature active, ${res.clearKeys ? Object.keys(res.clearKeys).length : 0} ClearKey(s) retrieved`);
        fetchSignatures();
      } else {
        throw new Error('No stream URL in response');
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to resolve video stream through gateway.'
      });
      addLog('error', `Playback verification failed: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  // ── Auto-Sync Setting Toggles ──
  const handleToggleAutoSync = async () => {
    setSavingAutoSync(true);
    const updated = {
      ...autoSyncConfig,
      enabled: !autoSyncConfig.enabled,
      updatedAt: Date.now()
    };
    try {
      await fetch(`${FIREBASE_DB_URL}/system_config/pw_auto_sync.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      setAutoSyncConfig(updated);
      addLog('info', `Automated background sync ${updated.enabled ? 'ENABLED' : 'PAUSED'}`);
    } catch (e) {
      addLog('error', `Failed to update auto-sync config: ${e.message}`);
    } finally {
      setSavingAutoSync(false);
    }
  };

  const handleUpdateInterval = async (mins) => {
    setSavingAutoSync(true);
    const updated = {
      ...autoSyncConfig,
      intervalMins: mins,
      updatedAt: Date.now()
    };
    try {
      await fetch(`${FIREBASE_DB_URL}/system_config/pw_auto_sync.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      setAutoSyncConfig(updated);
      addLog('info', `Automated sync interval set to every ${mins} minutes`);
    } catch (e) {
      addLog('error', `Failed to update interval: ${e.message}`);
    } finally {
      setSavingAutoSync(false);
    }
  };

  // ── MAIN SYNC ENGINE EXECUTION ──
  const handleStartSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    abortControllerRef.current = new AbortController();

    const batchesToProcess = selectedBatchScope === 'all' 
      ? PW_BATCHES 
      : PW_BATCHES.filter(b => b.batch_id === selectedBatchScope);

    setSyncProgress({
      percent: 0,
      currentBatch: '',
      statusText: 'Initializing sync engine...',
      scannedBatches: 0,
      chaptersProcessed: 0,
      newLecturesFound: 0,
      keysResolved: 0,
      dbUpdates: 0
    });

    addLog('info', `Starting [${syncMode.toUpperCase()}] sync on ${batchesToProcess.length} batch(es)...`);

    let totalNewLectures = 0;
    let totalKeysResolved = 0;
    let totalDbWrites = 0;
    let totalChapters = 0;

    try {
      for (let bIdx = 0; bIdx < batchesToProcess.length; bIdx++) {
        if (abortControllerRef.current?.signal.aborted) {
          addLog('warn', 'Sync cancelled by user.');
          break;
        }

        const batch = batchesToProcess[bIdx];
        const batchName = batch.batch_name;
        const batchId = batch.batch_id;
        const originalId = batch.pw_batch_id || batch.original_id;

        const basePercent = Math.round((bIdx / batchesToProcess.length) * 100);
        setSyncProgress(prev => ({
          ...prev,
          percent: basePercent,
          currentBatch: batchName,
          statusText: `Scanning ${batchName}...`,
          scannedBatches: bIdx
        }));

        addLog('info', `[Batch ${bIdx + 1}/${batchesToProcess.length}] ${batchName}`);

        // 1. Fetch current cached batch from Firebase RTDB (if exists)
        let cachedBatch = null;
        try {
          const fbRes = await fetch(`${FIREBASE_DB_URL}/nexthope_batches/batch_${encodeURIComponent(batchId)}.json`);
          if (fbRes.ok) cachedBatch = await fbRes.json();
        } catch (_) {}

        // Mode: KEYS_ONLY (Pass through existing items to resolve missing keys)
        if (syncMode === 'keys_only') {
          if (!cachedBatch || !Array.isArray(cachedBatch.subjects)) {
            addLog('warn', `  Batch has no cached structure in Firebase yet. Skipping keys pass.`);
            continue;
          }

          let batchModified = false;
          let keysInBatch = 0;

          for (const s of cachedBatch.subjects) {
            for (const f of (s.folders || [])) {
              for (const it of (f.items || [])) {
                if (it.type === 'video' && (!it.clear_keys && !it.stream_url)) {
                  try {
                    const vidRes = await callRpc('parcham_vid', {
                      batchId: originalId,
                      subjectId: s.masterId || s.subjectId,
                      childId: it.scheduleId || it.id,
                      videoId: it.videoId || '',
                      vUrl: it.vUrl || it.url || ''
                    });
                    if (vidRes && vidRes.url) {
                      it.url = vidRes.url;
                      it.stream_url = vidRes.url;
                      it.video_url = vidRes.url;
                      it.clear_keys = vidRes.clearKeys || null;
                      it.clearKeys = vidRes.clearKeys || null;
                      it.has_keys = Boolean(vidRes.clearKeys && Object.keys(vidRes.clearKeys).length > 0);
                      it.isPreResolved = true;
                      batchModified = true;
                      keysInBatch++;
                      totalKeysResolved++;
                      setSyncProgress(prev => ({ ...prev, keysResolved: totalKeysResolved }));
                      addLog('success', `  🔑 Pre-resolved keys for "${it.title.substring(0, 35)}..."`);
                    }
                  } catch (_) {}
                }
              }
            }
          }

          if (batchModified) {
            cachedBatch.last_synced = new Date().toISOString();
            await fetch(`${FIREBASE_DB_URL}/nexthope_batches/batch_${encodeURIComponent(batchId)}.json`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(cachedBatch)
            });
            totalDbWrites++;
            setSyncProgress(prev => ({ ...prev, dbUpdates: totalDbWrites }));
            addLog('success', `  💾 Saved ${keysInBatch} resolved keys back to Firebase RTDB`);
          } else {
            addLog('info', `  All existing lectures in ${batchName} already have keys.`);
          }
          continue;
        }

        // Mode: SMART or FULL
        // 2. Fetch Subjects
        let subjects = [];
        try {
          const dtl = await callRpc('pw_btch_dtl', { batchId: originalId });
          subjects = dtl?.subjects || [];
        } catch (e) {
          addLog('error', `  Failed to fetch subjects: ${e.message}`);
          continue;
        }

        addLog('info', `  Discovered ${subjects.length} subjects.`);

        // 3. Process Subjects & Chapters
        const subjectsWithChapters = [];
        for (const sub of subjects) {
          const subjectId = sub.subjectId || sub._id;
          let chapters = [];
          try {
            const chRes = await callRpc('pw_sub_topics', {
              batchId: originalId,
              subjectId,
              tagType: 'UNITS',
              page: 1,
              limit: 100
            });
            chapters = Array.isArray(chRes) ? chRes : (chRes?.data || []);
          } catch (_) {}

          subjectsWithChapters.push({
            id: subjectId,
            subjectId,
            subject_name: sub.subject || sub.name || subjectId,
            masterId: sub.masterId,
            batchSubjectId: sub.batchSubjectId,
            chapters
          });
        }

        // 4. Flatten chapters and fetch content
        const allChapterTasks = [];
        for (const s of subjectsWithChapters) {
          for (const ch of s.chapters) {
            allChapterTasks.push({
              subjectId: s.subjectId,
              masterId: s.masterId,
              subject_name: s.subject_name,
              chapterId: ch._id,
              chapterName: ch.name,
              order: ch.order
            });
          }
        }

        addLog('info', `  Processing ${allChapterTasks.length} chapters...`);

        // Helper map of existing items in cached batch (for smart diffing)
        const existingItemMap = new Map();
        if (cachedBatch && Array.isArray(cachedBatch.subjects)) {
          for (const s of cachedBatch.subjects) {
            for (const f of (s.folders || [])) {
              for (const it of (f.items || [])) {
                existingItemMap.set(String(it.id || it.scheduleId), it);
              }
            }
          }
        }

        const processedFolders = await pMap(allChapterTasks, async (chTask) => {
          totalChapters++;
          setSyncProgress(prev => ({ ...prev, chaptersProcessed: totalChapters }));

          // Fetch Lectures, Notes, DPPs
          let lectures = [];
          let notes = [];
          let dpp = [];

          try {
            const [lRes, nRes, dRes] = await Promise.allSettled([
              callRpc('pw_sch_cntnt', { batchId: originalId, subjectId: chTask.subjectId, tagId: chTask.chapterId, contentType: 'LECTURE', skip: 0, limit: 100 }),
              callRpc('pw_sch_cntnt', { batchId: originalId, subjectId: chTask.subjectId, tagId: chTask.chapterId, contentType: 'NOTES', skip: 0, limit: 100 }),
              callRpc('pw_sch_cntnt', { batchId: originalId, subjectId: chTask.subjectId, tagId: chTask.chapterId, contentType: 'DPP_PDF', skip: 0, limit: 100 })
            ]);
            const extract = (r) => (r.status === 'fulfilled' && r.value ? (Array.isArray(r.value) ? r.value : (r.value.data || [])) : []);
            lectures = extract(lRes);
            notes = extract(nRes);
            dpp = extract(dRes);
          } catch (_) {}

          const folderItems = [];

          // Process Lectures
          for (const lec of lectures) {
            const d = lec.data || {};
            const lid = lec._id || d._id;
            const existing = existingItemMap.get(String(lid));

            let streamUrl = existing?.stream_url || existing?.url || '';
            let clearKeys = existing?.clear_keys || existing?.clearKeys || null;
            let isNew = !existing;

            // In FULL mode OR if it's newly discovered OR has no stream info: resolve keys immediately!
            if (syncMode === 'full' || isNew || !streamUrl) {
              try {
                const vidRes = await callRpc('parcham_vid', {
                  batchId: originalId,
                  subjectId: chTask.masterId || chTask.subjectId,
                  childId: lid,
                  videoId: d.videoDetails?._id || '',
                  vUrl: d.url || d.videoDetails?.videoUrl || ''
                });
                if (vidRes && vidRes.url) {
                  streamUrl = vidRes.url;
                  clearKeys = vidRes.clearKeys || null;
                  totalKeysResolved++;
                  setSyncProgress(prev => ({ ...prev, keysResolved: totalKeysResolved }));
                }
              } catch (_) {}
            }

            if (isNew) {
              totalNewLectures++;
              setSyncProgress(prev => ({ ...prev, newLecturesFound: totalNewLectures }));
              addLog('new', `  🔥 NEW LECTURE: "${d.topic || 'Video'}" in ${chTask.chapterName}`);
            }

            let durationSecs = 0;
            if (d.videoDetails?.duration) {
              const parts = String(d.videoDetails.duration).split(':').map(Number);
              if (parts.length === 3) durationSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
              else if (parts.length === 2) durationSecs = parts[0] * 60 + parts[1];
            }

            folderItems.push({
              id: lid,
              title: d.topic || 'Video Lecture',
              type: 'video',
              subCategory: 'LECTURE',
              badgeText: 'VIDEO',
              isDynamicPw: true,
              isNewlyUploaded: isNew,
              batchId,
              subjectId: chTask.subjectId,
              masterId: chTask.masterId,
              scheduleId: lid,
              videoId: d.videoDetails?._id || d.videoDetails?.id || '',
              vUrl: d.url || d.videoDetails?.videoUrl || '',
              url: streamUrl || d.url || '',
              stream_url: streamUrl,
              video_url: streamUrl,
              clear_keys: clearKeys,
              clearKeys,
              has_keys: Boolean(clearKeys && Object.keys(clearKeys).length > 0),
              isPreResolved: Boolean(streamUrl),
              folder_path: chTask.chapterName,
              thumbnail: d.videoDetails?.image || '',
              duration: durationSecs,
              dateStr: d.date ? new Date(d.date).toLocaleDateString('en-GB') : '',
              created_at: d.date ? new Date(d.date).getTime() / 1000 : 0,
              subject_name: chTask.subject_name
            });
          }

          // Process Notes & DPPs
          for (const n of notes) {
            const d = n.data || {};
            const homework = d.homeworkIds?.[0];
            const attach = homework?.attachmentIds?.[0] || d.attachmentIds?.[0];
            const pdfUrl = attach?.baseUrl || '';
            const nid = n._id || d._id;
            const isNew = !existingItemMap.has(String(nid));

            folderItems.push({
              id: `pdf_${nid}`,
              title: d.topic || homework?.topic || 'Class Notes',
              type: 'pdf',
              subCategory: 'NOTES',
              badgeText: 'NOTES',
              isDynamicPw: true,
              isNewlyUploaded: isNew,
              batchId,
              subjectId: chTask.subjectId,
              scheduleId: nid,
              attachmentId: attach?._id || '',
              url: pdfUrl,
              raw_file_url: pdfUrl,
              folder_path: chTask.chapterName,
              dateStr: d.date ? new Date(d.date).toLocaleDateString('en-GB') : '',
              created_at: d.date ? new Date(d.date).getTime() / 1000 : 0,
              subject_name: chTask.subject_name
            });
          }

          for (const dp of dpp) {
            const d = dp.data || {};
            const homework = d.homeworkIds?.[0];
            const attach = homework?.attachmentIds?.[0] || d.attachmentIds?.[0];
            const pdfUrl = attach?.baseUrl || '';
            const did = dp._id || d._id;
            const isNew = !existingItemMap.has(String(did));

            folderItems.push({
              id: `dpp_${did}`,
              title: d.topic || homework?.topic || 'DPP',
              type: 'pdf',
              subCategory: 'DPP_PDF',
              badgeText: 'DPP PDF',
              isDynamicPw: true,
              isNewlyUploaded: isNew,
              batchId,
              subjectId: chTask.subjectId,
              scheduleId: did,
              attachmentId: attach?._id || '',
              url: pdfUrl,
              raw_file_url: pdfUrl,
              folder_path: chTask.chapterName,
              dateStr: d.date ? new Date(d.date).toLocaleDateString('en-GB') : '',
              created_at: d.date ? new Date(d.date).getTime() / 1000 : 0,
              subject_name: chTask.subject_name
            });
          }

          return {
            subjectId: chTask.subjectId,
            chapterId: chTask.chapterId,
            chapterName: chTask.chapterName,
            order: chTask.order,
            items: folderItems
          };
        }, 5);

        // 5. Construct updated batch tree
        let batchVideoCount = 0;
        let batchPdfCount = 0;

        const builtSubjects = subjectsWithChapters.map(s => {
          const folders = processedFolders.filter(pf => pf.subjectId === s.subjectId).map(pf => {
            const vids = pf.items.filter(it => it.type === 'video').length;
            const pdfs = pf.items.filter(it => it.type === 'pdf').length;
            batchVideoCount += vids;
            batchPdfCount += pdfs;

            return {
              id: pf.chapterId,
              title: pf.chapterName,
              order: pf.order || 1,
              items: pf.items
            };
          });

          return {
            id: s.subjectId,
            subjectId: s.subjectId,
            subject_name: s.subject_name,
            masterId: s.masterId,
            batchSubjectId: s.batchSubjectId,
            folders
          };
        });

        const fullBatchTree = {
          course_id: batchId,
          original_course_id: originalId,
          batch_name: batchName,
          is_dynamic_pw: true,
          last_synced: new Date().toISOString(),
          video_count: batchVideoCount,
          pdf_count: batchPdfCount,
          total_items: batchVideoCount + batchPdfCount,
          subjects: builtSubjects
        };

        // 6. Write to Firebase RTDB under dual aliases
        addLog('info', `  Writing to Firebase RTDB: ${batchVideoCount} videos, ${batchPdfCount} PDFs...`);
        const candidateKeys = [batchId, batchId.replace(/^batch_/, '')];
        for (const k of candidateKeys) {
          await fetch(`${FIREBASE_DB_URL}/nexthope_batches/batch_${encodeURIComponent(k)}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullBatchTree)
          });
          await fetch(`${FIREBASE_DB_URL}/pw_batches/${encodeURIComponent(k)}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fullBatchTree)
          });
        }
        totalDbWrites += 2;
        setSyncProgress(prev => ({ ...prev, dbUpdates: totalDbWrites }));
        addLog('success', `  ✅ Successfully synchronized ${batchName} with Firebase RTDB!`);

        // Record audit log for this batch
        await fetch(`${FIREBASE_DB_URL}/pw_sync_logs/${Date.now()}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: Date.now(),
            mode: syncMode,
            batchId,
            batchName,
            videoCount: batchVideoCount,
            pdfCount: batchPdfCount,
            totalItems: batchVideoCount + batchPdfCount,
            newLecturesFound: totalNewLectures,
            keysResolved: totalKeysResolved,
            triggeredBy: 'Admin Control Center'
          })
        }).catch(() => {});
      }

      setSyncProgress(prev => ({
        ...prev,
        percent: 100,
        statusText: `Sync complete! Added ${totalNewLectures} new lectures, resolved ${totalKeysResolved} DRM keys.`,
        scannedBatches: batchesToProcess.length
      }));
      addLog('success', `🎉 SYNC PROCESS COMPLETE! Total New: ${totalNewLectures}, Total Keys: ${totalKeysResolved}`);
      fetchSyncAuditLogs();
      fetchSignatures();
    } catch (err) {
      addLog('error', `Sync failed: ${err.message}`);
      setSyncProgress(prev => ({ ...prev, statusText: `Error: ${err.message}` }));
    } finally {
      setIsSyncing(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopSync = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addLog('warn', 'User clicked Stop Sync. Halting pending requests...');
    }
    setIsSyncing(false);
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const copyAllLogs = () => {
    const text = consoleLogs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text);
    copyToClipboard(text, 'console_all');
  };

  // Decode JWT details
  let decodedUser = null;
  let decodedOfficialPw = null;
  let tokenExpiryDate = null;
  let isExpired = false;

  if (authData?.cookie) {
    const accMatch = authData.cookie.match(/accessToken=([A-Za-z0-9._-]+)/);
    if (accMatch) {
      decodedUser = parseJwt(accMatch[1]);
      if (decodedUser?.ActualToken) {
        decodedOfficialPw = parseJwt(decodedUser.ActualToken);
      }
      if (decodedUser?.exp) {
        tokenExpiryDate = new Date(decodedUser.exp * 1000);
        isExpired = Date.now() > decodedUser.exp * 1000;
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* ── TOP BANNER ── */}
      <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#262626] pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Key size={22} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">PW Stream Auth & Realtime Ingestion Hub</h2>
              <p className="text-xs sm:text-sm text-[#9ca3af]">
                Autonomous stream key pre-resolution, real-time incremental discovery, and multi-gateway edge synchronization
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchAuthData(); fetchSignatures(); fetchSyncAuditLogs(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#262626] text-xs font-medium text-white border border-[#333] transition"
              title="Refresh auth and signatures status"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh Status</span>
            </button>
            <button
              onClick={handleTestConnection}
              disabled={testing || !authData?.cookie}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-xs font-semibold text-black transition shadow-sm"
            >
              <PlayCircle size={14} className={testing ? 'animate-spin' : ''} />
              <span>{testing ? 'Testing...' : 'Test Stream Playback'}</span>
            </button>
          </div>
        </div>

        {/* Live Test Result Alert */}
        {testResult && (
          <div className={`mt-4 p-4 rounded-xl border flex items-start gap-3 text-xs sm:text-sm ${
            testResult.success 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {testResult.success ? (
              <CheckCircle size={18} className="shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <ShieldAlert size={18} className="shrink-0 text-rose-400 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="font-semibold">{testResult.message}</p>
              {testResult.details && (
                <div className="mt-2 text-xs font-mono space-y-1 bg-black/40 p-2.5 rounded-lg border border-white/5">
                  <p><span className="text-[#9ca3af]">ClearKeys:</span> {testResult.details.clearKeys}</p>
                  <p><span className="text-[#9ca3af]">Tested At:</span> {testResult.details.time}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9ca3af]">Token Status</span>
              {authData?.cookie && !isExpired ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active & Synced
                </span>
              ) : isExpired ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  Expired
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  No Token
                </span>
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-[#9ca3af]">Relay Identity</p>
              <p className="text-sm font-semibold text-white truncate">
                {decodedUser?.name || decodedOfficialPw?.data?.firstName || 'Anonymous Edge'}
              </p>
            </div>
            {tokenExpiryDate && (
              <div className="mt-2 pt-2 border-t border-[#2a2a2a] text-[11px] text-[#9ca3af]">
                <span>Expires: </span>
                <span className="text-white font-medium">{tokenExpiryDate.toLocaleDateString()}</span>
              </div>
            )}
          </div>

          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9ca3af]">Signature Pool</span>
              <button
                onClick={fetchSignatures}
                className="text-amber-400 hover:text-amber-300 text-[11px] flex items-center gap-1"
              >
                <RefreshCw size={11} className={loadingSignatures ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{cachedSignatures.length}</span>
              <span className="text-xs text-[#9ca3af]">folders unlocked</span>
            </div>
            <p className="text-[11px] text-[#9ca3af] mt-2">
              All students play DRM lectures with zero token gating.
            </p>
          </div>

          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9ca3af]">Batches Configured</span>
              <span className="text-xs font-mono text-amber-400">13 Batches</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{PW_BATCHES.length}</span>
              <span className="text-xs text-[#9ca3af]">active courses</span>
            </div>
            <p className="text-[11px] text-[#9ca3af] mt-2">
              Class 9th, 10th, 11th, 12th, Droppers, NDA & CUET.
            </p>
          </div>

          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9ca3af]">Autonomous Auto-Sync</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                autoSyncConfig.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
              }`}>
                {autoSyncConfig.enabled ? 'ACTIVE' : 'PAUSED'}
              </span>
            </div>
            <p className="text-xs text-white font-medium">Every {autoSyncConfig.intervalMins} Minutes</p>
            <p className="text-[11px] text-[#9ca3af] mt-2">
              Background SWR revalidation & RTDB delta patching enabled.
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION: REALTIME INGESTION & DRM KEY RESOLUTION CENTER ── */}
      <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#262626] pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap size={20} />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white">PW Content Ingestion & DRM Key Pre-Resolution Center</h3>
              <p className="text-xs text-[#9ca3af]">
                Pre-resolves stream manifests & ClearKeys into Firebase RTDB so lectures play immediately with 0ms delay
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isSyncing ? (
              <button
                type="button"
                onClick={handleStartSync}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 font-bold text-xs sm:text-sm text-black transition shadow-lg shadow-amber-500/10 cursor-pointer"
              >
                <Play size={15} fill="currentColor" />
                <span>Start Sync Now</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopSync}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 font-bold text-xs sm:text-sm text-white transition cursor-pointer"
              >
                <Square size={14} fill="currentColor" />
                <span>Stop Sync</span>
              </button>
            )}
          </div>
        </div>

        {/* Sync Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Mode Selector */}
          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
            <label className="block text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">
              Execution Mode
            </label>
            <div className="space-y-2">
              <label className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition ${
                syncMode === 'smart' 
                  ? 'bg-amber-500/10 border-amber-500/40 text-white' 
                  : 'bg-black/30 border-transparent text-[#9ca3af] hover:text-white'
              }`}>
                <input
                  type="radio"
                  name="syncMode"
                  value="smart"
                  checked={syncMode === 'smart'}
                  onChange={() => setSyncMode('smart')}
                  disabled={isSyncing}
                  className="mt-0.5 accent-amber-500"
                />
                <div className="text-xs">
                  <p className="font-bold text-amber-400">⚡ Smart Incremental Sync (Recommended)</p>
                  <p className="text-[11px] text-[#9ca3af] mt-0.5">
                    Checks for new lectures, pre-resolves DRM keys for new items, and immediately logs into database.
                  </p>
                </div>
              </label>

              <label className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition ${
                syncMode === 'full' 
                  ? 'bg-amber-500/10 border-amber-500/40 text-white' 
                  : 'bg-black/30 border-transparent text-[#9ca3af] hover:text-white'
              }`}>
                <input
                  type="radio"
                  name="syncMode"
                  value="full"
                  checked={syncMode === 'full'}
                  onChange={() => setSyncMode('full')}
                  disabled={isSyncing}
                  className="mt-0.5 accent-amber-500"
                />
                <div className="text-xs">
                  <p className="font-bold text-blue-400">🔄 Deep Full Sync (All Previous Lectures)</p>
                  <p className="text-[11px] text-[#9ca3af] mt-0.5">
                    Runs on all previous lectures irrespective of saved status, re-resolving streams & keys for all.
                  </p>
                </div>
              </label>

              <label className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition ${
                syncMode === 'keys_only' 
                  ? 'bg-amber-500/10 border-amber-500/40 text-white' 
                  : 'bg-black/30 border-transparent text-[#9ca3af] hover:text-white'
              }`}>
                <input
                  type="radio"
                  name="syncMode"
                  value="keys_only"
                  checked={syncMode === 'keys_only'}
                  onChange={() => setSyncMode('keys_only')}
                  disabled={isSyncing}
                  className="mt-0.5 accent-amber-500"
                />
                <div className="text-xs">
                  <p className="font-bold text-purple-400">🔑 DRM Key Pre-Resolution Pass</p>
                  <p className="text-[11px] text-[#9ca3af] mt-0.5">
                    Scans existing batches in database and fills missing ClearKeys/signatures so playback is instant.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Scope Selector */}
          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
            <label className="block text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">
              Batch Target Scope
            </label>
            <select
              value={selectedBatchScope}
              onChange={e => setSelectedBatchScope(e.target.value)}
              disabled={isSyncing}
              className="w-full bg-[#0d0d0d] border border-[#333] text-white text-xs rounded-lg p-2.5 focus:outline-none focus:border-amber-500 transition"
            >
              <option value="all">🌟 All 13 Physics Wallah Batches (Full Pool)</option>
              {PW_BATCHES.map(b => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.batch_name}
                </option>
              ))}
            </select>

            <div className="mt-4 p-3 rounded-lg bg-black/40 border border-[#262626] text-xs text-[#9ca3af] space-y-1">
              <p className="font-semibold text-white">Target Summary:</p>
              <p>• Scope: {selectedBatchScope === 'all' ? '13 Batches' : '1 Specific Batch'}</p>
              <p>• Multi-Gateway Pool: 5 Cloudflare & Render Edge Nodes</p>
              <p>• Output Paths: <code>/nexthope_batches</code> & <code>/pw_batches</code></p>
            </div>
          </div>

          {/* Background Auto-Sync Settings */}
          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">
                Autonomous Scheduler
              </label>
              <button
                type="button"
                onClick={handleToggleAutoSync}
                disabled={savingAutoSync}
                className={`text-[11px] px-2.5 py-1 rounded font-bold transition ${
                  autoSyncConfig.enabled 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30' 
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
                }`}
              >
                {savingAutoSync ? 'Saving...' : autoSyncConfig.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            <p className="text-xs text-[#9ca3af] mb-3">
              Automatically checks for new lectures and pre-resolves keys in the background:
            </p>

            <div className="grid grid-cols-4 gap-1.5 mb-3">
              {[15, 30, 60, 180].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => handleUpdateInterval(mins)}
                  disabled={savingAutoSync || !autoSyncConfig.enabled}
                  className={`py-1.5 text-[11px] font-bold rounded border transition ${
                    autoSyncConfig.intervalMins === mins && autoSyncConfig.enabled
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                      : 'bg-black/30 border-transparent text-[#9ca3af] hover:text-white'
                  }`}
                >
                  {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-[#71717a]">
              Settings are saved in Firebase RTDB (<code>/system_config/pw_auto_sync</code>) and synchronized across all instances.
            </p>
          </div>
        </div>

        {/* Live Progress Bar & Status Counters */}
        <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626] mb-6">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-white flex items-center gap-2">
              <Activity size={14} className={isSyncing ? "animate-pulse text-amber-400" : "text-[#71717a]"} />
              {syncProgress.statusText}
            </span>
            <span className="font-mono font-bold text-amber-400">{syncProgress.percent}%</span>
          </div>

          {/* Bar */}
          <div className="w-full h-2.5 bg-[#0a0a0a] rounded-full overflow-hidden border border-[#262626] mb-4">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300 rounded-full"
              style={{ width: `${syncProgress.percent}%` }}
            />
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
            <div className="bg-black/40 p-2.5 rounded-lg border border-[#262626]">
              <p className="text-[#9ca3af] text-[11px]">Batches Scanned</p>
              <p className="text-sm font-bold text-white mt-0.5">{syncProgress.scannedBatches}</p>
            </div>
            <div className="bg-black/40 p-2.5 rounded-lg border border-[#262626]">
              <p className="text-[#9ca3af] text-[11px]">Chapters Checked</p>
              <p className="text-sm font-bold text-white mt-0.5">{syncProgress.chaptersProcessed}</p>
            </div>
            <div className="bg-black/40 p-2.5 rounded-lg border border-[#262626]">
              <p className="text-[#9ca3af] text-[11px]">New Lectures</p>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">+{syncProgress.newLecturesFound}</p>
            </div>
            <div className="bg-black/40 p-2.5 rounded-lg border border-[#262626]">
              <p className="text-[#9ca3af] text-[11px]">Keys Resolved</p>
              <p className="text-sm font-bold text-amber-400 mt-0.5">{syncProgress.keysResolved}</p>
            </div>
            <div className="bg-black/40 p-2.5 rounded-lg border border-[#262626] col-span-2 sm:col-span-1">
              <p className="text-[#9ca3af] text-[11px]">Database Writes</p>
              <p className="text-sm font-bold text-cyan-400 mt-0.5">{syncProgress.dbUpdates}</p>
            </div>
          </div>
        </div>

        {/* Realtime Terminal Console */}
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#141414] border-b border-[#262626]">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
              <span className="text-xs font-mono text-[#9ca3af] ml-2">Realtime Execution Stream</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyAllLogs}
                className="text-[11px] text-[#9ca3af] hover:text-white flex items-center gap-1 transition"
                title="Copy all logs"
              >
                {copiedKey === 'console_all' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copiedKey === 'console_all' ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() => setConsoleLogs([])}
                className="text-[11px] text-[#9ca3af] hover:text-white flex items-center gap-1 transition"
                title="Clear console"
              >
                <Trash2 size={12} />
                <span>Clear</span>
              </button>
            </div>
          </div>

          <div ref={consoleContainerRef} className="p-3 font-mono text-xs max-h-64 overflow-y-auto space-y-1 select-text custom-scrollbar">
            {consoleLogs.length === 0 ? (
              <p className="text-[#525252] italic">Ready. Click "Start Sync Now" to run real-time crawler and key resolver.</p>
            ) : (
              consoleLogs.map(log => {
                let colorClass = 'text-[#9ca3af]';
                if (log.type === 'success') colorClass = 'text-emerald-400 font-medium';
                if (log.type === 'new') colorClass = 'text-amber-300 font-bold';
                if (log.type === 'warn') colorClass = 'text-yellow-400';
                if (log.type === 'error') colorClass = 'text-rose-400 font-semibold';
                return (
                  <div key={log.id} className="leading-relaxed flex gap-2">
                    <span className="text-[#525252] shrink-0">[{log.time}]</span>
                    <span className={colorClass}>{log.text}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Discovery & Sync Audit History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={13} />
              <span>Recent Ingestion & Discovery Audit Logs</span>
            </h4>
            <button
              onClick={fetchSyncAuditLogs}
              className="text-amber-400 hover:text-amber-300 text-xs flex items-center gap-1"
            >
              <RefreshCw size={11} />
              <span>Refresh Logs</span>
            </button>
          </div>

          {syncAuditLogs.length === 0 ? (
            <p className="text-xs text-[#525252] italic bg-[#1a1a1a] p-3 rounded-lg border border-[#262626]">
              No audit logs recorded yet. Automated and manual sync events will appear here in real time.
            </p>
          ) : (
            <div className="space-y-2">
              {syncAuditLogs.map(entry => (
                <div key={entry.id} className="bg-[#1a1a1a] p-3 rounded-lg border border-[#262626] flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{entry.batchName || entry.batchId}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {entry.mode || entry.type || 'SWR_REALTIME'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#9ca3af] mt-0.5">
                      {entry.totalItems ? `${entry.videoCount || 0} Videos • ${entry.pdfCount || 0} PDFs` : `${entry.count || 0} New items discovered`}
                      {entry.keysResolved ? ` • ${entry.keysResolved} Keys pre-resolved` : ''}
                      {entry.triggeredBy ? ` • Triggered by: ${entry.triggeredBy}` : ''}
                    </p>
                  </div>
                  <span className="text-[11px] text-[#71717a] shrink-0 font-mono">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION: SESSION COOKIE & ROTATION ── */}
      <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm p-4 sm:p-6">
        <h3 className="text-lg font-bold text-white mb-2">Update / Rotate Auth Session Cookie</h3>
        <p className="text-xs sm:text-sm text-[#9ca3af] mb-4">
          Paste the verified session cookie string containing <code>anon_id</code>, <code>accessToken</code>, and <code>refreshToken</code>. Cloudflare edge workers use this credential to decrypt streams and bypass token gates.
        </p>

        <form onSubmit={handleSaveCookie} className="space-y-4">
          <div>
            <textarea
              rows={4}
              value={cookieInput}
              onChange={e => setCookieInput(e.target.value)}
              placeholder="anon_id=...; accessToken=...; refreshToken=..."
              className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl p-3 text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
              required
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="submit"
              disabled={saving || !cookieInput.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-xs sm:text-sm font-semibold text-black transition shadow-sm cursor-pointer"
            >
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <SaveIcon size={15} />}
              <span>{saving ? 'Saving to Firebase RTDB...' : 'Save & Sync Cloudflare'}</span>
            </button>

            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle size={15} />
                Successfully updated Firebase RTDB and Edge Gateways!
              </span>
            )}
            {saveError && (
              <span className="flex items-center gap-1.5 text-xs text-rose-400 font-medium">
                <ShieldAlert size={15} />
                {saveError}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ── SECTION: CACHED WILDCARD SIGNATURES ── */}
      <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Database size={18} className="text-amber-400" />
            <h3 className="text-base sm:text-lg font-bold text-white">Cached CloudFront Wildcard Signatures</h3>
          </div>
          <span className="text-xs text-[#9ca3af]">Stored in Firebase RTDB (<code>/pw_signatures</code>)</span>
        </div>

        {loadingSignatures ? (
          <div className="text-center py-8 text-xs text-[#9ca3af]">Loading signatures...</div>
        ) : cachedSignatures.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#9ca3af] bg-[#1a1a1a] rounded-xl border border-[#262626]">
            No signatures cached yet. Run Smart or Full sync above to populate the cache.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#1a1a1a] text-[#9ca3af] border-b border-[#262626]">
                <tr>
                  <th className="py-2.5 px-3 font-medium">Folder UUID</th>
                  <th className="py-2.5 px-3 font-medium">Status</th>
                  <th className="py-2.5 px-3 font-medium">Last Cached</th>
                  <th className="py-2.5 px-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262626]">
                {cachedSignatures.map((sig, idx) => (
                  <tr key={sig.folder} className="hover:bg-white/[0.02] transition">
                    <td className="py-2.5 px-3 font-mono text-white">{sig.folder}</td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Active Wildcard
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#9ca3af]">
                      {sig.updatedAt ? new Date(sig.updatedAt).toLocaleString() : 'Permanent Static'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => copyToClipboard(sig.folder, `f_${idx}`)}
                        className="text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1"
                      >
                        {copiedKey === `f_${idx}` ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedKey === `f_${idx}` ? 'Copied' : 'Copy'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SaveIcon({ size = 16, className = '' }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
  );
}
