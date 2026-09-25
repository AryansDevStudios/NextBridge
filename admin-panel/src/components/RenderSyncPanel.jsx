import React, { useState, useEffect } from 'react';
import { RefreshCw, Server, CheckCircle, Clock, Key } from 'lucide-react';

const RENDER_BACKEND_URL = "https://nxttoppers-archive.onrender.com/api/sync";
const TOKEN_INFO_URL = "https://nxttoppers-archive.onrender.com/api/token/info";

const RenderSyncPanel = () => {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loadingToken, setLoadingToken] = useState(true);

  const fetchTokenInfo = async () => {
    setLoadingToken(true);
    try {
      const res = await fetch(TOKEN_INFO_URL);
      if (res.ok) {
        const data = await res.json();
        setTokenInfo(data);
      }
    } catch (err) {
      console.error("Failed to fetch token info", err);
    } finally {
      setLoadingToken(false);
    }
  };

  useEffect(() => {
    fetchTokenInfo();
  }, []);

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${RENDER_BACKEND_URL}?admin=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin: true })
      });

      if (res && res.ok) {
        const data = await res.json();
        setLastSyncResult({ success: true, time: new Date().toLocaleTimeString(), message: data.message });
      } else {
        throw new Error("Failed to trigger sync");
      }
    } catch(err) {
      setLastSyncResult({ success: false, error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-[#121212] border border-[#262626] rounded-xl shadow-sm p-4 sm:p-8">
      <div className="flex items-center space-x-3 mb-4 sm:mb-6 border-b border-[#262626] pb-3 sm:pb-4">
         <Server className="text-[#f59e0b]" size={24} />
         <h2 className="text-xl sm:text-2xl font-bold">Render Server Sync</h2>
      </div>

      <div className="bg-[#1a1a1a] p-4 sm:p-6 rounded-xl border border-[#262626] mb-6 sm:mb-8">
        <p className="text-[#9ca3af] mb-4 text-xs sm:text-sm leading-relaxed">
           Use this panel to immediately trigger a content sync on your Render.com backend server.
           This will force the server to crawl <strong>NextToppers.com</strong> and upload any new batches, PDFs, or videos to the Firebase Realtime Database.
        </p>

        <div className="space-y-3 sm:space-y-4">
          <div className="flex items-center space-x-3 sm:space-x-4 bg-[#0a0a0a] p-3 sm:p-4 rounded-lg border border-[#262626]">
             <Clock className="text-[#525252] shrink-0" size={18} />
             <div>
                 <p className="text-xs sm:text-sm font-medium text-white">Automated Sync Schedule</p>
                 <p className="text-[11px] sm:text-xs text-[#9ca3af]">Runs every 30 minutes in the background</p>
             </div>
          </div>
          
          <div className="flex items-start space-x-3 sm:space-x-4 bg-[#0a0a0a] p-3 sm:p-4 rounded-lg border border-[#262626]">
             <Key className="text-[#525252] shrink-0 mt-0.5" size={18} />
             <div className="flex-1 min-w-0">
                 <div className="flex justify-between items-center mb-1">
                   <p className="text-xs sm:text-sm font-medium text-white">Current API Token</p>
                   <button onClick={fetchTokenInfo} className="text-[#f59e0b] hover:text-[#fbbf24] text-[11px] sm:text-xs font-semibold px-2 py-0.5 bg-[#f59e0b]/10 rounded transition-colors">
                     Refresh
                   </button>
                 </div>
                 {loadingToken ? (
                   <p className="text-xs text-[#9ca3af]">Loading token info...</p>
                 ) : tokenInfo ? (
                   <div className="space-y-1">
                     <p className="text-xs text-[#9ca3af] font-mono break-all">{tokenInfo.maskedToken}</p>
                     <p className="text-[11px] sm:text-xs text-green-500">Last updated: {tokenInfo.lastUpdated}</p>
                   </div>
                 ) : (
                   <p className="text-xs text-red-500">Failed to load token information</p>
                 )}
             </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <button 
          onClick={handleForceSync}
          disabled={syncing}
          className={`flex items-center justify-center space-x-2 px-6 py-3 rounded-lg font-bold text-sm sm:text-base transition-all w-full sm:w-auto
            ${syncing ? 'bg-[#f59e0b]/50 text-[#0a0a0a] cursor-not-allowed' : 'bg-[#f59e0b] text-[#0a0a0a] hover:bg-[#fbbf24]'}
          `}
        >
          <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
          <span>{syncing ? 'Syncing Database...' : 'Force Manual Sync Now'}</span>
        </button>

        {lastSyncResult && (
          <div className="flex items-center space-x-2 text-xs sm:text-sm max-w-sm">
             {lastSyncResult.success ? (
                 <>
                   <CheckCircle className="text-green-500 shrink-0" size={18} />
                   <span className="text-green-500 font-medium break-words">
                     {lastSyncResult.message || `Sync Triggered at ${lastSyncResult.time}`}
                   </span>
                 </>
             ) : (
                 <span className="text-red-500 font-medium break-words">Sync Failed: {lastSyncResult.error}</span>
             )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RenderSyncPanel;
