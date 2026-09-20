import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Download, Shield, Loader2, PlayCircle, CheckCircle, Maximize, Minimize } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';
import { Capacitor } from '@capacitor/core';

const VideoPlayer = ({ item, onClose }) => {
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [localUri, setLocalUri] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    // 1. Enable FLAG_SECURE to prevent screenshots/recording
    if (Capacitor.isNativePlatform()) {
      PrivacyScreen.enable().catch(console.error);
    }
    
    checkLocalFile();

    return () => {
      // Revert FLAG_SECURE when unmounting
      if (Capacitor.isNativePlatform()) {
        PrivacyScreen.disable().catch(console.error);
        ScreenOrientation.unlock().catch(console.error);
      }
    };
  }, []);

  const checkLocalFile = async () => {
    try {
      const fileName = `${item.id}_${item.type === 'video' ? 'video.mp4' : 'doc.pdf'}`;
      const stat = await Filesystem.stat({
        path: fileName,
        directory: Directory.Data
      });
      
      if (stat) {
        // File exists locally! Get the native URI to play it securely.
        const uri = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Data
        });
        setLocalUri(Capacitor.convertFileSrc(uri.uri));
      }
    } catch (e) {
      // File doesn't exist
      setLocalUri(null);
    }
  };

  const handleDownload = async () => {
    if (isDownloading || localUri) return;
    setIsDownloading(true);
    try {
      const fileName = `${item.id}_${item.type === 'video' ? 'video.mp4' : 'doc.pdf'}`;
      
      // We simulate download progress because Capacitor Http plugin doesn't give precise progress on simple fetch
      // For production, use Capacitor Http with `downloadFile` plugin or standard fetch reading streams
      let progress = 0;
      const interval = setInterval(() => {
         progress += 10;
         if(progress <= 90) setDownloadProgress(progress);
      }, 500);

      // Simple fetch blob and write approach (Good for moderate sizes)
      const res = await fetch(item.url);
      const blob = await res.blob();
      
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        clearInterval(interval);
        const base64data = reader.result;
        
        await Filesystem.writeFile({
          path: fileName,
          data: base64data,
          directory: Directory.Data,
        });
        
        setDownloadProgress(100);
        setIsDownloading(false);
        checkLocalFile(); // reload the UI to use the local URI
      };
    } catch (err) {
      console.error("Download failed", err);
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const toggleFullscreen = async () => {
    if (!videoRef.current) return;
    
    if (!isFullscreen) {
      if (videoRef.current.requestFullscreen) {
        await videoRef.current.requestFullscreen();
      }
      if (Capacitor.isNativePlatform()) {
        await ScreenOrientation.lock({ orientation: 'landscape' });
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
      if (Capacitor.isNativePlatform()) {
        await ScreenOrientation.unlock();
      }
      setIsFullscreen(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#000000] text-[#f3f4f6]">
      {/* Header */}
      <div className="bg-[#121212] border-b border-[#262626] px-4 py-4 flex items-center sticky top-0 z-10 pt-10">
        <button onClick={onClose} className="p-2 mr-2 text-[#9ca3af] hover:text-[#f59e0b] bg-[#1e1e1e] rounded-full">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[15px] font-bold truncate flex-1">{item.title}</h1>
        <Shield size={18} className="text-[#4ade80]" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center relative p-4">
        {item.type === 'video' ? (
          <div className="w-full relative bg-[#121212] rounded-xl overflow-hidden shadow-2xl border border-[#262626]">
             <video 
               ref={videoRef}
               src={localUri || item.url} 
               controls 
               controlsList="nodownload"
               playsInline
               className="w-full h-auto max-h-[60vh] object-contain"
             />
             
             {/* Custom Fullscreen button overlay to trigger orientation lock natively */}
             <button 
               onClick={toggleFullscreen} 
               className="absolute bottom-4 right-4 bg-black/60 p-2 rounded-lg text-white hover:text-[#f59e0b] backdrop-blur"
             >
               {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
             </button>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 bg-[#121212] rounded-xl border border-[#262626]">
            <PlayCircle size={64} className="text-[#f59e0b] mb-4" />
            <h2 className="text-xl font-bold mb-2">PDF Document</h2>
            <p className="text-[#9ca3af] text-sm mb-6">This document is protected. Open below.</p>
            <a 
              href={localUri || item.url} 
              target="_blank" 
              rel="noreferrer"
              className="bg-[#f59e0b] text-black font-bold py-3 px-8 rounded-xl"
            >
              Open Document
            </a>
          </div>
        )}

        <div className="mt-8 w-full max-w-md">
          {localUri ? (
            <div className="bg-[#1a1a1a] border border-[#262626] p-4 rounded-xl flex items-center space-x-3 text-[#4ade80]">
              <CheckCircle size={24} />
              <div>
                <p className="font-bold">Downloaded Securely</p>
                <p className="text-xs text-[#9ca3af]">Available for offline viewing</p>
              </div>
            </div>
          ) : (
            <button 
              onClick={handleDownload}
              disabled={isDownloading}
              className={`w-full py-4 rounded-xl flex items-center justify-center font-bold text-[#0a0a0a] transition-all
                ${isDownloading ? 'bg-[#f59e0b]/50 cursor-not-allowed' : 'bg-[#f59e0b] hover:bg-[#fbbf24]'}
              `}
            >
              {isDownloading ? (
                <>
                  <Loader2 size={20} className="animate-spin mr-2" />
                  Downloading... {downloadProgress}%
                </>
              ) : (
                <>
                  <Download size={20} className="mr-2" />
                  Download for Offline
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
