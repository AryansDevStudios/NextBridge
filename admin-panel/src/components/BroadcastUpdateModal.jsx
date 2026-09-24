import React, { useState, useMemo } from 'react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { X, ShieldAlert, Download, CheckCircle2, AlertTriangle, Layers, Radio } from 'lucide-react';
import { 
  CURRENT_LATEST_VERSION, 
  CURRENT_LATEST_CODE, 
  DEFAULT_ANDROID_VERSION_CONFIG, 
  getAndroidVersionStatus, 
  compareSemver 
} from '../utils/version';

export default function BroadcastUpdateModal({ students, versionConfig = DEFAULT_ANDROID_VERSION_CONFIG, onClose, onSuccess }) {
  const [targetScope, setTargetScope] = useState('outdated'); // 'outdated', 'critical', 'android', 'all'
  const [minVersion, setMinVersion] = useState(versionConfig?.latestAppVersion || CURRENT_LATEST_VERSION);
  const [minVersionCode, setMinVersionCode] = useState(versionConfig?.latestVersionCode || CURRENT_LATEST_CODE);
  const [downloadUrl, setDownloadUrl] = useState(versionConfig?.apkDownloadUrl || '');
  const [targetPlatform, setTargetPlatform] = useState('android');
  const [message, setMessage] = useState(
    versionConfig?.defaultMessage || `A mandatory app update (v${versionConfig?.latestAppVersion || CURRENT_LATEST_VERSION}) is required to continue using NextBridge.`
  );
  const [releaseNotes, setReleaseNotes] = useState(
    versionConfig?.releaseNotes || '• High-performance immersive full-screen mode\n• Video player stability enhancements\n• Offline PDF & document improvements'
  );
  const [processing, setProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');

  // Calculate targeted students — web users are isolated so they are never falsely locked out
  const targetedStudents = useMemo(() => {
    return students.filter(s => {
      const isAndroid = s.platform === 'android' || (s.device && (!s.platform || s.platform === 'android'));

      if (targetScope === 'all') return true;
      if (targetScope === 'android') {
        return isAndroid;
      }
      if (targetScope === 'critical') {
        if (!isAndroid) return false;
        const vStatus = getAndroidVersionStatus(s, versionConfig);
        return vStatus.status === 'critical';
      }
      if (targetScope === 'outdated') {
        // Only target Android students who are Red or Yellow
        if (!isAndroid) return false;
        const vStatus = getAndroidVersionStatus(s, versionConfig);
        return vStatus.status === 'critical' || vStatus.status === 'outdated' || compareSemver(s.appVersion, minVersion) < 0;
      }
      return false;
    });
  }, [students, targetScope, minVersion, versionConfig]);

  const handleApplyLockout = async () => {
    if (!downloadUrl.trim()) {
      const confirmNoUrl = window.confirm('You have not entered an APK Download URL. Students will see the lockout message without a direct download link. Proceed anyway?');
      if (!confirmNoUrl) return;
    }

    if (targetedStudents.length === 0) {
      alert('No students match the selected target criteria.');
      return;
    }

    setProcessing(true);
    let updatedCount = 0;
    try {
      for (const student of targetedStudents) {
        setProgressText(`Updating ${updatedCount + 1} of ${targetedStudents.length}...`);
        await updateDoc(doc(db, 'students', student.id), {
          forcedUpdate: {
            enabled: true,
            minVersion: minVersion.trim(),
            minVersionCode: Number(minVersionCode) || CURRENT_LATEST_CODE,
            downloadUrl: downloadUrl.trim(),
            message: message.trim(),
            releaseNotes: releaseNotes.trim(),
            targetPlatform,
            updatedAt: new Date().toISOString()
          }
        });
        updatedCount++;
      }
      alert(`Successfully applied remote update lockout to ${updatedCount} student(s)!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error applying batch lockout:', err);
      alert(`Error updating students: ${err.message}`);
    } finally {
      setProcessing(false);
      setProgressText('');
    }
  };

  const handleRemoveLockout = async () => {
    if (targetedStudents.length === 0) {
      alert('No students match the selected target criteria.');
      return;
    }

    if (!window.confirm(`Are you sure you want to remove the update lockout for ${targetedStudents.length} student(s)?`)) {
      return;
    }

    setProcessing(true);
    let updatedCount = 0;
    try {
      for (const student of targetedStudents) {
        setProgressText(`Unlocking ${updatedCount + 1} of ${targetedStudents.length}...`);
        // Write the full object so no stale minVersion/downloadUrl fields remain,
        // preventing students from being re-targeted on the next "Outdated Only" broadcast
        await updateDoc(doc(db, 'students', student.id), {
          forcedUpdate: {
            enabled: false,
            minVersion: '',
            minVersionCode: 0,
            downloadUrl: '',
            message: '',
            releaseNotes: '',
            targetPlatform: 'android',
            updatedAt: new Date().toISOString()
          }
        });
        updatedCount++;
      }
      alert(`Successfully removed update lockout for ${updatedCount} student(s)!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error removing batch lockout:', err);
      alert(`Error unlocking students: ${err.message}`);
    } finally {
      setProcessing(false);
      setProgressText('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#121212] border border-[#262626] rounded-2xl w-full max-w-xl text-[#f3f4f6] shadow-2xl my-auto overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#262626] bg-[#161616]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[#f59e0b]">
              <Download size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Broadcast App Update Lockout</h2>
              <p className="text-xs text-[#9ca3af]">Remotely lock out students until they install the latest APK</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-[#9ca3af] hover:text-white p-1.5 rounded-lg hover:bg-[#222] transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Target Audience Selector */}
          <div>
            <label className="block text-xs font-semibold text-[#9ca3af] uppercase tracking-wider mb-2">
              Target Audience ({targetedStudents.length} students matched)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setTargetScope('outdated')}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${targetScope === 'outdated' ? 'bg-amber-950/20 border-[#f59e0b] text-white' : 'bg-[#181818] border-[#262626] text-[#9ca3af] hover:border-[#333]'}`}
              >
                <div className="font-semibold text-xs text-[#f3f4f6]">Outdated (Yellow/Red)</div>
                <div className="text-[11px] opacity-75 mt-1">&lt; v{versionConfig?.latestAppVersion || minVersion}</div>
              </button>

              <button
                type="button"
                onClick={() => setTargetScope('critical')}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${targetScope === 'critical' ? 'bg-red-950/30 border-red-500 text-white' : 'bg-[#181818] border-[#262626] text-[#9ca3af] hover:border-[#333]'}`}
              >
                <div className="font-semibold text-xs text-red-400">Critical (&lt; Min) Only</div>
                <div className="text-[11px] opacity-75 mt-1">&lt; v{versionConfig?.minAppVersion || '2.7.0'}</div>
              </button>

              <button
                type="button"
                onClick={() => setTargetScope('android')}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${targetScope === 'android' ? 'bg-amber-950/20 border-[#f59e0b] text-white' : 'bg-[#181818] border-[#262626] text-[#9ca3af] hover:border-[#333]'}`}
              >
                <div className="font-semibold text-xs text-[#f3f4f6]">All Android</div>
                <div className="text-[11px] opacity-75 mt-1">Mobile users</div>
              </button>

              <button
                type="button"
                onClick={() => setTargetScope('all')}
                className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${targetScope === 'all' ? 'bg-amber-950/20 border-[#f59e0b] text-white' : 'bg-[#181818] border-[#262626] text-[#9ca3af] hover:border-[#333]'}`}
              >
                <div className="font-semibold text-xs text-[#f3f4f6]">All Students</div>
                <div className="text-[11px] opacity-75 mt-1">Everyone</div>
              </button>
            </div>
          </div>

          {/* Quick Pre-fill Helpers */}
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-[#9ca3af]">Database Preset Shortcuts:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMinVersion(versionConfig?.latestAppVersion || CURRENT_LATEST_VERSION);
                  setMinVersionCode(versionConfig?.latestVersionCode || CURRENT_LATEST_CODE);
                }}
                className="px-2.5 py-1 rounded bg-[#262626] hover:bg-[#333] text-emerald-400 border border-emerald-900/40 text-[11px] font-medium"
              >
                Use Latest (v{versionConfig?.latestAppVersion || CURRENT_LATEST_VERSION})
              </button>
              <button
                type="button"
                onClick={() => {
                  setMinVersion(versionConfig?.minAppVersion || '2.7.0');
                  setMinVersionCode(versionConfig?.minVersionCode || 20700);
                }}
                className="px-2.5 py-1 rounded bg-[#262626] hover:bg-[#333] text-red-400 border border-red-900/40 text-[11px] font-medium"
              >
                Use Floor Min (v{versionConfig?.minAppVersion || '2.7.0'})
              </button>
            </div>
          </div>

          {/* Version Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#9ca3af] mb-1">
                Required Min Version
              </label>
              <input
                type="text"
                value={minVersion}
                onChange={e => setMinVersion(e.target.value)}
                placeholder="2.7.0"
                className="w-full bg-[#181818] border border-[#262626] rounded-xl px-3 py-2 text-sm text-[#f3f4f6] focus:border-[#f59e0b] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#9ca3af] mb-1">
                Required Version Code
              </label>
              <input
                type="number"
                value={minVersionCode}
                onChange={e => setMinVersionCode(e.target.value)}
                placeholder="20700"
                className="w-full bg-[#181818] border border-[#262626] rounded-xl px-3 py-2 text-sm text-[#f3f4f6] focus:border-[#f59e0b] focus:outline-none"
              />
            </div>
          </div>

          {/* Target Platform */}
          <div>
            <label className="block text-xs font-semibold text-[#9ca3af] mb-1">
              Target Platform
            </label>
            <select
              value={targetPlatform}
              onChange={e => setTargetPlatform(e.target.value)}
              className="w-full bg-[#181818] border border-[#262626] rounded-xl px-3 py-2 text-sm text-[#f3f4f6] focus:border-[#f59e0b] focus:outline-none"
            >
              <option value="android">Android App Only (Recommended for APK updates)</option>
              <option value="all">All Platforms (Android & Web)</option>
            </select>
          </div>

          {/* Download URL */}
          <div>
            <label className="block text-xs font-semibold text-[#9ca3af] mb-1">
              APK Download URL
            </label>
            <input
              type="url"
              value={downloadUrl}
              onChange={e => setDownloadUrl(e.target.value)}
              placeholder="https://... (Google Drive, Netlify, or direct .apk link)"
              className="w-full bg-[#181818] border border-[#262626] rounded-xl px-3 py-2 text-sm text-[#f3f4f6] focus:border-[#f59e0b] focus:outline-none"
            />
            <p className="text-[11px] text-[#71717a] mt-1">
              Students will click this button to directly download the new APK.
            </p>
          </div>

          {/* Lockout Message */}
          <div>
            <label className="block text-xs font-semibold text-[#9ca3af] mb-1">
              Lockout Banner Message
            </label>
            <textarea
              rows={2}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="A mandatory app update is required to continue..."
              className="w-full bg-[#181818] border border-[#262626] rounded-xl px-3 py-2 text-xs text-[#f3f4f6] focus:border-[#f59e0b] focus:outline-none resize-none"
            />
          </div>

          {/* Release Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#9ca3af] mb-1">
              Release Notes / Highlights
            </label>
            <textarea
              rows={3}
              value={releaseNotes}
              onChange={e => setReleaseNotes(e.target.value)}
              placeholder="• Feature 1\n• Feature 2"
              className="w-full bg-[#181818] border border-[#262626] rounded-xl px-3 py-2 text-xs text-[#f3f4f6] focus:border-[#f59e0b] focus:outline-none resize-none font-mono"
            />
          </div>

          {/* Summary Alert */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start space-x-2">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            <div>
              <strong>Self-Unlocking Behavior:</strong> When locked students install and launch v{minVersion}, the app automatically reports the new version and unlocks their access immediately.
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-4 sm:p-5 border-t border-[#262626] bg-[#161616] flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="text-xs text-[#9ca3af]">
            {processing ? progressText : `${targetedStudents.length} student(s) selected`}
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              disabled={processing}
              onClick={handleRemoveLockout}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-red-400 border border-red-900/50 hover:bg-red-950/30 transition disabled:opacity-50"
            >
              Clear Lockout
            </button>

            <button
              type="button"
              disabled={processing}
              onClick={handleApplyLockout}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#f59e0b] text-[#0a0a0a] hover:bg-[#fbbf24] transition disabled:opacity-50 flex items-center space-x-1.5 shadow-lg shadow-amber-500/10"
            >
              <Download size={14} />
              <span>Apply Lockout ({targetedStudents.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
