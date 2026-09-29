import React, { useState, useEffect } from 'react';
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
  Layers
} from 'lucide-react';

const FIREBASE_DB_URL = 'https://nxttopperindexdb-default-rtdb.asia-southeast1.firebasedatabase.app';
const GATEWAY_URL = 'https://nextbridgeapi.adsbackend01.workers.dev/pw/api/data';

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

export default function AdminPwAuthPanel() {
  const [authData, setAuthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cookieInput, setCookieInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Live stream test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Cached signatures state
  const [cachedSignatures, setCachedSignatures] = useState([]);
  const [loadingSignatures, setLoadingSignatures] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

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

  useEffect(() => {
    fetchAuthData();
    fetchSignatures();
  }, []);

  const handleSave = async (e) => {
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
    } catch (err) {
      setSaveError(err.message || 'Failed to save auth cookie');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // Test Lecture: Light - Reflection 08 (known gated video)
      const res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'parcham_vid',
          params: {
            batchId: '6a071d17f84ddfb496a59f76',
            subjectId: 'physics-095174',
            childId: '6a4a01c39d5c6e39e375d9c4'
          },
          method: 'GET'
        })
      });

      const json = await res.json();
      if (res.ok && json.success && json.data?.url) {
        setTestResult({
          success: true,
          message: 'Playback Stream Verified! CloudFront wildcard signature and DRM ClearKeys retrieved successfully.',
          details: {
            manifest: json.data.url,
            clearKeys: json.data.clearKeys ? Object.keys(json.data.clearKeys).length + ' Key(s)' : 'None (Open Stream)',
            time: new Date().toLocaleTimeString()
          }
        });
        // Re-fetch signatures since gateway auto-cached this folder
        fetchSignatures();
      } else {
        setTestResult({
          success: false,
          message: json.error || 'Failed to resolve video stream through gateway.'
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.message || 'Network error while testing gateway'
      });
    } finally {
      setTesting(false);
    }
  };

  // Decode JWT details from accessToken if present
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

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#262626] pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Key size={22} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">PW Stream Auth & Anon Tokens</h2>
              <p className="text-xs sm:text-sm text-[#9ca3af]">
                Active server cookies relayed by Cloudflare Workers to bypass ad-shortener gates and auto-cache CloudFront signatures
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchAuthData(); fetchSignatures(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a1a1a] hover:bg-[#262626] text-xs font-medium text-white border border-[#333] transition"
              title="Refresh auth status"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
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

        {/* Active Token Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {/* Card 1: Auth Status */}
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

            <div className="space-y-1">
              <p className="text-xs text-[#9ca3af]">Associated Account</p>
              <p className="text-sm font-semibold text-white">
                {decodedUser?.name || decodedOfficialPw?.data?.firstName || 'Anonymous Relay'}
              </p>
              {decodedOfficialPw?.data?.username && (
                <p className="text-xs font-mono text-amber-400/90">{decodedOfficialPw.data.username}</p>
              )}
            </div>

            {tokenExpiryDate && (
              <div className="mt-3 pt-3 border-t border-[#2a2a2a] text-[11px] text-[#9ca3af]">
                <span>Expires: </span>
                <span className="text-white font-medium">{tokenExpiryDate.toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Card 2: Anonymous Client ID */}
          <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#262626]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9ca3af]">Session Identity (anon_id)</span>
              {authData?.anon_id && (
                <button
                  onClick={() => copyToClipboard(authData.anon_id, 'anon')}
                  className="text-amber-400 hover:text-amber-300 text-[11px] flex items-center gap-1"
                >
                  {copiedKey === 'anon' ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedKey === 'anon' ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>

            <p className="text-xs font-mono text-white break-all bg-[#0d0d0d] p-2 rounded-lg border border-[#262626]">
              {authData?.anon_id || 'Not configured'}
            </p>

            <div className="mt-3 pt-2 text-[11px] text-[#9ca3af] flex justify-between">
              <span>Updated by:</span>
              <span className="text-white">{authData?.updatedBy || 'N/A'}</span>
            </div>
          </div>

          {/* Card 3: CloudFront Signature Cache Pool */}
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
              <span className="text-xs text-[#9ca3af]">video folders unlocked</span>
            </div>

            <p className="text-[11px] text-[#9ca3af] mt-2">
              Each cached folder allows any student to play lectures without token gates.
            </p>
          </div>
        </div>
      </div>

      {/* Token Update Form */}
      <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm p-4 sm:p-6">
        <h3 className="text-lg font-bold text-white mb-2">Update / Rotate Auth Session Cookie</h3>
        <p className="text-xs sm:text-sm text-[#9ca3af] mb-4">
          Paste the verified session cookie string containing <code>anon_id</code>, <code>accessToken</code>, and <code>refreshToken</code>. The Cloudflare Workers will automatically use this credential for all background signature resolutions.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
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
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-xs sm:text-sm font-semibold text-black transition shadow-sm"
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

      {/* Cached Video Folders List */}
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
            No signatures cached yet. Play any lecture to automatically populate the cache.
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
