import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  X, 
  Settings, 
  Smartphone, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Download, 
  Save, 
  RotateCcw,
  Sparkles,
  Info
} from 'lucide-react';
import { DEFAULT_ANDROID_VERSION_CONFIG } from '../utils/version';

export default function AppVersionSettingsModal({ isOpen, onClose, currentConfig, onSaveSuccess }) {
  const [minAppVersion, setMinAppVersion] = useState(DEFAULT_ANDROID_VERSION_CONFIG.minAppVersion);
  const [minVersionCode, setMinVersionCode] = useState(DEFAULT_ANDROID_VERSION_CONFIG.minVersionCode);
  const [latestAppVersion, setLatestAppVersion] = useState(DEFAULT_ANDROID_VERSION_CONFIG.latestAppVersion);
  const [latestVersionCode, setLatestVersionCode] = useState(DEFAULT_ANDROID_VERSION_CONFIG.latestVersionCode);
  const [apkDownloadUrl, setApkDownloadUrl] = useState('');
  const [defaultMessage, setDefaultMessage] = useState(DEFAULT_ANDROID_VERSION_CONFIG.defaultMessage);
  const [releaseNotes, setReleaseNotes] = useState(DEFAULT_ANDROID_VERSION_CONFIG.releaseNotes);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  useEffect(() => {
    if (currentConfig) {
      setMinAppVersion(currentConfig.minAppVersion || DEFAULT_ANDROID_VERSION_CONFIG.minAppVersion);
      setMinVersionCode(currentConfig.minVersionCode ?? DEFAULT_ANDROID_VERSION_CONFIG.minVersionCode);
      setLatestAppVersion(currentConfig.latestAppVersion || DEFAULT_ANDROID_VERSION_CONFIG.latestAppVersion);
      setLatestVersionCode(currentConfig.latestVersionCode ?? DEFAULT_ANDROID_VERSION_CONFIG.latestVersionCode);
      setApkDownloadUrl(currentConfig.apkDownloadUrl || '');
      setDefaultMessage(currentConfig.defaultMessage || DEFAULT_ANDROID_VERSION_CONFIG.defaultMessage);
      setReleaseNotes(currentConfig.releaseNotes || DEFAULT_ANDROID_VERSION_CONFIG.releaseNotes);
      setLastSavedAt(currentConfig.updatedAt || null);
    }
  }, [currentConfig, isOpen]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const payload = {
        minAppVersion: minAppVersion.trim(),
        minVersionCode: Number(minVersionCode) || 0,
        latestAppVersion: latestAppVersion.trim(),
        latestVersionCode: Number(latestVersionCode) || 0,
        apkDownloadUrl: apkDownloadUrl.trim(),
        defaultMessage: defaultMessage.trim(),
        releaseNotes: releaseNotes.trim(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'system_config', 'app_versions'), payload, { merge: true });
      setLastSavedAt(payload.updatedAt);
      if (onSaveSuccess) onSaveSuccess(payload);
      alert('Android Version Control settings successfully saved to database!');
      onClose();
    } catch (err) {
      console.error('Failed to save version settings to Firestore:', err);
      alert(`Error saving version settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all values to default standards?')) {
      setMinAppVersion(DEFAULT_ANDROID_VERSION_CONFIG.minAppVersion);
      setMinVersionCode(DEFAULT_ANDROID_VERSION_CONFIG.minVersionCode);
      setLatestAppVersion(DEFAULT_ANDROID_VERSION_CONFIG.latestAppVersion);
      setLatestVersionCode(DEFAULT_ANDROID_VERSION_CONFIG.latestVersionCode);
      setDefaultMessage(DEFAULT_ANDROID_VERSION_CONFIG.defaultMessage);
      setReleaseNotes(DEFAULT_ANDROID_VERSION_CONFIG.releaseNotes);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#121212] border border-[#262626] rounded-2xl w-full max-w-2xl my-auto overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#262626] bg-[#141414]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/30 flex items-center justify-center text-[#f59e0b]">
              <Settings size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Android Version Control Center</span>
                <span className="text-[10px] bg-[#f59e0b]/20 text-[#f59e0b] px-2 py-0.5 rounded font-mono uppercase font-bold border border-[#f59e0b]/30">
                  Cloud Synced
                </span>
              </h2>
              <p className="text-xs text-[#9ca3af]">
                Database-driven criteria for evaluating student app versions (Red / Yellow / Green)
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-[#9ca3af] hover:text-white p-1.5 rounded-lg hover:bg-[#262626] transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
          
          {/* Explanation Banner */}
          <div className="bg-[#181818] border border-[#262626] p-3.5 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#f3f4f6]">
              <Info size={14} className="text-[#f59e0b]" />
              <span>How Student Status Badges are Evaluated:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <div className="p-2.5 rounded-lg bg-red-950/20 border border-red-900/40">
                <span className="font-bold text-red-400 block mb-0.5">🔴 RED (Critical)</span>
                <p className="text-[11px] text-[#9ca3af]">
                  Version is missing or strictly below <strong className="text-white">Minimum</strong> (v{minAppVersion} / {minVersionCode}). Lockout recommended.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-900/40">
                <span className="font-bold text-amber-400 block mb-0.5">🟡 YELLOW (Update Avail)</span>
                <p className="text-[11px] text-[#9ca3af]">
                  Between Minimum and <strong className="text-white">Latest</strong> (v{latestAppVersion} / {latestVersionCode}). Functional, but older.
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-900/40">
                <span className="font-bold text-emerald-400 block mb-0.5">🟢 GREEN (Latest)</span>
                <p className="text-[11px] text-[#9ca3af]">
                  Meets or exceeds <strong className="text-white">Latest</strong>. Web users are isolated and always safe.
                </p>
              </div>
            </div>
          </div>

          {/* Section 1: The 4 Core Criteria */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-[#f59e0b] uppercase tracking-wider flex items-center gap-2">
              <Smartphone size={14} />
              <span>Android App Version & Build Criteria</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Minimum Version Box */}
              <div className="bg-[#161616] p-4 rounded-xl border border-red-900/30 space-y-3">
                <div className="flex items-center justify-between border-b border-[#262626] pb-2">
                  <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                    <AlertTriangle size={13} />
                    <span>1 & 2. Minimum Required Floor</span>
                  </span>
                  <span className="text-[10px] text-[#71717a]">Threshold for Red</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#9ca3af] mb-1">
                    Minimum SemVer (<code className="text-white">minAppVersion</code>)
                  </label>
                  <input
                    type="text"
                    required
                    value={minAppVersion}
                    onChange={e => setMinAppVersion(e.target.value)}
                    placeholder="2.7.0"
                    className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg text-sm text-white focus:border-red-500 outline-none font-mono"
                  />
                  <p className="text-[10px] text-[#6b7280] mt-1">Students below this SemVer show as Red.</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#9ca3af] mb-1">
                    Minimum Build Code (<code className="text-white">minVersionCode</code>)
                  </label>
                  <input
                    type="number"
                    required
                    value={minVersionCode}
                    onChange={e => setMinVersionCode(e.target.value)}
                    placeholder="20700"
                    className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg text-sm text-white focus:border-red-500 outline-none font-mono"
                  />
                  <p className="text-[10px] text-[#6b7280] mt-1">Native build integer (MAJOR*10000 + MINOR*100 + PATCH).</p>
                </div>
              </div>

              {/* Latest Version Box */}
              <div className="bg-[#161616] p-4 rounded-xl border border-emerald-900/30 space-y-3">
                <div className="flex items-center justify-between border-b border-[#262626] pb-2">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={13} />
                    <span>3 & 4. Latest Target Release</span>
                  </span>
                  <span className="text-[10px] text-[#71717a]">Threshold for Green</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#9ca3af] mb-1">
                    Latest SemVer (<code className="text-white">latestAppVersion</code>)
                  </label>
                  <input
                    type="text"
                    required
                    value={latestAppVersion}
                    onChange={e => setLatestAppVersion(e.target.value)}
                    placeholder="2.7.4"
                    className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg text-sm text-white focus:border-emerald-500 outline-none font-mono"
                  />
                  <p className="text-[10px] text-[#6b7280] mt-1">Students on or above this SemVer show as Green.</p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#9ca3af] mb-1">
                    Latest Build Code (<code className="text-white">latestVersionCode</code>)
                  </label>
                  <input
                    type="number"
                    required
                    value={latestVersionCode}
                    onChange={e => setLatestVersionCode(e.target.value)}
                    placeholder="20704"
                    className="w-full px-3 py-2 bg-[#121212] border border-[#262626] rounded-lg text-sm text-white focus:border-emerald-500 outline-none font-mono"
                  />
                  <p className="text-[10px] text-[#6b7280] mt-1">Official build code of the newest release.</p>
                </div>
              </div>

            </div>
          </div>

          {/* Section 2: Distribution Settings */}
          <div className="space-y-3 pt-2 border-t border-[#262626]">
            <h3 className="text-xs font-bold text-[#f3f4f6] uppercase tracking-wider flex items-center gap-2">
              <Download size={14} className="text-[#f59e0b]" />
              <span>Official APK Download & Broadcast Defaults</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-[#9ca3af] mb-1">
                Direct APK Download URL
              </label>
              <input
                type="url"
                value={apkDownloadUrl}
                onChange={e => setApkDownloadUrl(e.target.value)}
                placeholder="https://nextbridgeweb.netlify.app/releases/NextBridge-latest.apk"
                className="w-full px-3 py-2 bg-[#161616] border border-[#262626] rounded-lg text-xs text-white focus:border-[#f59e0b] outline-none font-mono"
              />
              <p className="text-[10px] text-[#6b7280] mt-1">
                This URL is automatically populated when launching Broadcast Update or student lockouts.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9ca3af] mb-1">
                Default Lockout Notice
              </label>
              <textarea
                rows={2}
                value={defaultMessage}
                onChange={e => setDefaultMessage(e.target.value)}
                placeholder="A mandatory app update is required to continue using NextBridge."
                className="w-full px-3 py-2 bg-[#161616] border border-[#262626] rounded-lg text-xs text-white focus:border-[#f59e0b] outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9ca3af] mb-1">
                Default Release Notes
              </label>
              <textarea
                rows={2}
                value={releaseNotes}
                onChange={e => setReleaseNotes(e.target.value)}
                placeholder="• Feature 1\n• Feature 2"
                className="w-full px-3 py-2 bg-[#161616] border border-[#262626] rounded-lg text-xs text-white focus:border-[#f59e0b] outline-none resize-none font-mono"
              />
            </div>
          </div>

          {/* Sync Timestamp Footer */}
          {lastSavedAt && (
            <div className="text-[11px] text-[#6b7280] flex items-center justify-between pt-2 border-t border-[#262626]">
              <span>Database Version: Active</span>
              <span>Last updated: {new Date(lastSavedAt).toLocaleString()}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 pt-3 border-t border-[#262626]">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="w-full sm:w-auto px-3.5 py-2 rounded-lg border border-[#333] text-[#9ca3af] hover:text-white hover:bg-[#1a1a1a] text-xs font-medium transition flex items-center justify-center space-x-1.5"
            >
              <RotateCcw size={13} />
              <span>Reset Standards</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2 bg-[#181818] hover:bg-[#222] border border-[#333] text-white text-xs font-semibold rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 sm:flex-initial flex items-center justify-center space-x-1.5 px-5 py-2 bg-[#f59e0b] hover:bg-[#fbbf24] text-[#0a0a0a] font-bold text-xs rounded-lg transition shadow-lg shadow-amber-500/10 disabled:opacity-50"
              >
                <Save size={14} />
                <span>{saving ? 'Saving to Database...' : 'Save Settings'}</span>
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
}
