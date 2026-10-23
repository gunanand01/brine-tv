import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  AlertTriangle,
  RefreshCw,
  SkipForward,
  Pin,
  Radio,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import QualitySelector, {
  STANDARD_QUALITY_TIERS,
  resolveQualityTierLabel,
} from './QualitySelector';
import { getChannelInitials } from '../utils/m3uParser';

const STREAM_TIMEOUT_MS = 5000;

/**
 * Apna Cloudflare Worker URL yahan set karein (ya .env mein VITE_CORS_PROXY_URL dalein).
 * Format: https://brinetv-proxy.brinetube.workers.dev
 */
export const CORS_PROXY_BASE_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_CORS_PROXY_URL) ||
  'https://brinetv-proxy.brinetube.workers.dev';

/**
 * Helper: Original stream URL ko Cloudflare Worker proxy URL mein convert karta hai:
 * https://brinetv-proxy.brinetube.workers.dev/?url=<encoded-stream-url>
 */
export function buildProxyStreamUrl(originalStreamUrl) {
  if (!originalStreamUrl) return '';
  return `https://brinetv-proxy.brinetube.workers.dev/?url=${encodeURIComponent(originalStreamUrl)}`;
}

/**
 * Brinetv Live Video Player Component (V3 with Automatic CORS Proxy Fallback).
 *
 * Flow:
 * 1. Pehle stream ko direct load karne ki koshish karta hai (`useProxy = false`).
 * 2. Agar direct stream CORS error de ya 5 second mein load na ho, toh automatically
 *    Cloudflare Worker Proxy URL (`https://<worker>.<subdomain>.workers.dev/?url=...`)
 *    ke through retry karta hai (`useProxy = true`).
 * 3. Agar proxy ke through bhi stream fail ho jaye, toh user ko dikhata hai:
 *    'Channel is offline or source is blocked.'
 */
export default function Player({
  channel,
  isPinned,
  onTogglePin,
  onSelectNextChannel,
}) {
  const videoRef = useRef(null);
  const playerContainerRef = useRef(null);
  const hlsRef = useRef(null);
  const loadTimeoutRef = useRef(null);
  const hasStartedPlaybackRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [errorState, setErrorState] = useState(null);
  const [logoError, setLogoError] = useState(false);

  // Proxy fallback state: false = Direct stream, true = Cloudflare Worker Proxy
  const [useProxy, setUseProxy] = useState(false);

  const [availableQualities, setAvailableQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState('Auto');
  const [activeAutoLabel, setActiveAutoLabel] = useState(null);
  const [isSwitchingLevel, setIsSwitchingLevel] = useState(false);
  const [isSingleOrLowQuality, setIsSingleOrLowQuality] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  // Jab naya channel select ho, hamesha pehle direct stream try karo
  useEffect(() => {
    setUseProxy(false);
    setErrorState(null);
    setLogoError(false);
  }, [channel?.id, channel?.streamUrl]);

  /**
   * Maps hls.levels into ordered buttons (144p, 240p, 360p, 480p, 720p, 1080p).
   */
  const extractAvailableQualities = useCallback((levels = []) => {
    if (!Array.isArray(levels) || levels.length === 0) return [];

    const tierMap = new Map();
    levels.forEach((lvl, idx) => {
      const label = resolveQualityTierLabel(lvl);
      const height = Number(lvl?.height) || 0;
      const bitrate = Number(lvl?.bitrate) || 0;

      const existing = tierMap.get(label);
      if (!existing || bitrate > existing.bitrate) {
        tierMap.set(label, {
          label,
          levelIndex: idx,
          height,
          bitrate,
        });
      }
    });

    const ordered = [];
    STANDARD_QUALITY_TIERS.forEach((tier) => {
      if (tierMap.has(tier)) {
        ordered.push(tierMap.get(tier));
      }
    });

    return ordered;
  }, []);

  /**
   * Stream loader with automatic Direct -> Proxy fallback.
   */
  useEffect(() => {
    const video = videoRef.current;
    const rawStreamUrl = channel?.streamUrl;
    if (!video || !rawStreamUrl) return undefined;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    clearLoadTimeout();
    hasStartedPlaybackRef.current = false;

    setErrorState(null);
    setIsBuffering(true);
    setIsPlaying(false);
    setAvailableQualities([]);
    setSelectedQuality('Auto');
    setActiveAutoLabel(null);
    setIsSwitchingLevel(false);
    setIsSingleOrLowQuality(false);

    // Decide URL: Direct first, or Proxied if direct failed
    const effectiveStreamUrl = useProxy
      ? buildProxyStreamUrl(rawStreamUrl)
      : rawStreamUrl;

    /**
     * Triggered when stream fails (CORS error, network error, or 5s timeout).
     * If currently on Direct mode, automatically switches to Proxy mode.
     * If already on Proxy mode, shows the final offline error message.
     */
    const handleStreamFailure = () => {
      clearLoadTimeout();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (!useProxy) {
        // Automatic fallback to Cloudflare Worker CORS Proxy
        setUseProxy(true);
        return;
      }

      // Proxy ke through bhi fail ho gaya -> final message dikhao
      video.removeAttribute('src');
      video.load();
      setIsBuffering(false);
      setIsSwitchingLevel(false);
      setErrorState('Channel is offline or source is blocked.');
    };

    // 5-second timeout per attempt (5s for direct, then 5s for proxy)
    loadTimeoutRef.current = setTimeout(() => {
      if (!hasStartedPlaybackRef.current) {
        handleStreamFailure();
      }
    }, STREAM_TIMEOUT_MS);

    const markStreamHealthy = () => {
      hasStartedPlaybackRef.current = true;
      clearLoadTimeout();
      setIsBuffering(false);
    };

    const isMp4 = /\.(mp4|webm|ogg)(\?.*)?$/i.test(rawStreamUrl);

    if (isMp4) {
      setIsSingleOrLowQuality(true);
      video.src = effectiveStreamUrl;
      video.load();
      video
        .play()
        .then(() => {
          markStreamHealthy();
          setIsPlaying(true);
        })
        .catch(() => {
          video.muted = true;
          setIsMuted(true);
          video
            .play()
            .then(() => {
              markStreamHealthy();
              setIsPlaying(true);
            })
            .catch(() => {});
        });
      return () => clearLoadTimeout();
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        startLevel: -1, // Mobile-first Auto resolution
        capLevelToPlayerSize: true,
        manifestLoadingTimeOut: 4500,
        levelLoadingTimeOut: 4500,
        fragLoadingTimeOut: 4500,
      });
      hlsRef.current = hls;

      hls.loadSource(effectiveStreamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const levels = hls.levels || data?.levels || [];
        const qualities = extractAvailableQualities(levels);
        setAvailableQualities(qualities);
        setSelectedQuality('Auto');

        if (qualities.length <= 1) {
          setIsSingleOrLowQuality(true);
          if (qualities.length === 1) {
            setActiveAutoLabel(qualities[0].label);
          }
        } else {
          const maxHeight = Math.max(...levels.map((l) => Number(l.height) || 0));
          setIsSingleOrLowQuality(maxHeight > 0 && maxHeight <= 360);
        }

        video
          .play()
          .then(() => {
            markStreamHealthy();
            setIsPlaying(true);
          })
          .catch(() => {
            video.muted = true;
            setIsMuted(true);
            video
              .play()
              .then(() => {
                markStreamHealthy();
                setIsPlaying(true);
              })
              .catch(() => {});
          });
      });

      hls.on(Hls.Events.LEVEL_SWITCHING, () => {
        setIsSwitchingLevel(true);
        setIsBuffering(true);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setIsSwitchingLevel(false);
        setIsBuffering(false);
        const currentIdx = data?.level;
        if (typeof currentIdx === 'number' && hls.levels[currentIdx]) {
          const label = resolveQualityTierLabel(hls.levels[currentIdx]);
          setActiveAutoLabel(label);
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        markStreamHealthy();
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          if (
            data.details === Hls.ErrorDetails.LEVEL_SWITCH_ERROR ||
            data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT
          ) {
            setIsSwitchingLevel(false);
            setIsBuffering(false);
            hls.currentLevel = -1;
            setSelectedQuality('Auto');
            setIsSingleOrLowQuality(true);
          }
          return;
        }

        // Fatal error (including CORS manifestLoadError / fragLoadError) -> fallback to Proxy or show Offline
        handleStreamFailure();
      });

      return () => {
        clearLoadTimeout();
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      setIsSingleOrLowQuality(true);
      video.src = effectiveStreamUrl;
      video.addEventListener('loadedmetadata', () => {
        markStreamHealthy();
        video.play().catch(() => {});
      });
      return () => clearLoadTimeout();
    } else {
      handleStreamFailure();
    }

    return undefined;
  }, [
    channel?.streamUrl,
    useProxy,
    reloadNonce,
    extractAvailableQualities,
    clearLoadTimeout,
  ]);

  const handleSelectQuality = useCallback((qualityLabel, levelIndex) => {
    const hls = hlsRef.current;
    if (!hls) return;

    if (qualityLabel === 'Auto' || levelIndex === -1) {
      setSelectedQuality('Auto');
      setIsSwitchingLevel(true);
      setIsBuffering(true);
      hls.currentLevel = -1;
      setTimeout(() => {
        setIsSwitchingLevel(false);
        setIsBuffering(false);
      }, 400);
      return;
    }

    setSelectedQuality(qualityLabel);
    setIsSwitchingLevel(true);
    setIsBuffering(true);
    try {
      hls.currentLevel = levelIndex;
    } catch (_err) {
      hls.currentLevel = -1;
      setSelectedQuality('Auto');
      setIsSwitchingLevel(false);
      setIsBuffering(false);
    }
  }, []);

  const handleManualRetry = () => {
    setErrorState(null);
    setUseProxy(false);
    setReloadNonce((n) => n + 1);
  };

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video || errorState) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    const video = videoRef.current;
    setVolume(val);
    if (video) {
      video.volume = val;
      video.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleFullscreen = async () => {
    const container = playerContainerRef.current;
    if (!container) return;
    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (_err) {
      // Ignore fullscreen restriction
    }
  };

  if (!channel) return null;
  const initials = getChannelInitials(channel.name);

  return (
    <section
      ref={playerContainerRef}
      className="bg-[#0D111A] border border-slate-800/90 rounded-2xl overflow-hidden shadow-xl flex flex-col"
      aria-label="Live TV Player"
    >
      {/* Compact Mobile-First Channel Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4 bg-[#121722] border-b border-slate-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#0B0E17] border border-slate-800 flex items-center justify-center p-1 shrink-0 overflow-hidden">
            {channel.logo && !logoError ? (
              <img
                src={channel.logo}
                alt={channel.name}
                className="w-full h-full object-contain"
                onLoad={(e) => {
                  if (e.currentTarget.naturalWidth < 4) setLogoError(true);
                }}
                onError={() => setLogoError(true)}
              />
            ) : (
              <span className="text-xs font-extrabold text-orange-400 tracking-wider">
                {initials}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                {channel.name}
              </h2>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
              {useProxy && !errorState && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0"
                  title="Stream routed via Cloudflare Worker CORS Proxy"
                >
                  <ShieldCheck className="w-3 h-3 text-cyan-400" />
                  Proxy
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] text-slate-400">{channel.category}</span>
              {channel.language && (
                <>
                  <span className="text-slate-600 text-[10px]">•</span>
                  <span className="text-[11px] text-slate-400">{channel.language}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onTogglePin(channel.id)}
          className={`p-2 rounded-xl border transition-all shrink-0 ${
            isPinned
              ? 'bg-orange-500 text-slate-950 border-orange-400'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
          }`}
          title={isPinned ? 'Unpin Channel' : 'Pin Channel'}
          aria-label="Pin Channel"
        >
          <Pin className={`w-4 h-4 ${isPinned ? 'fill-slate-950' : ''}`} />
        </button>
      </div>

      {/* Video Viewport */}
      <div className="relative bg-black aspect-video w-full overflow-hidden group">
        <video
          ref={videoRef}
          className="w-full h-full object-contain bg-black"
          playsInline
          onClick={togglePlayPause}
          onPlaying={() => {
            hasStartedPlaybackRef.current = true;
            clearLoadTimeout();
            setIsPlaying(true);
            setIsBuffering(false);
            setIsSwitchingLevel(false);
          }}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onError={() => {
            clearLoadTimeout();
            if (!useProxy) {
              setUseProxy(true);
            } else {
              setIsBuffering(false);
              setIsSwitchingLevel(false);
              setErrorState('Channel is offline or source is blocked.');
            }
          }}
        />

        {/* Buffering Spinner (on initial load, proxy retry & quality switch) */}
        {(isBuffering || isSwitchingLevel) && !errorState && (
          <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-2 pointer-events-none z-10">
            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
            <span className="text-xs font-medium text-slate-200 bg-slate-900/90 px-3 py-1 rounded-full border border-slate-800">
              {isSwitchingLevel
                ? 'Switching quality...'
                : useProxy
                ? 'Trying via CORS Proxy...'
                : 'Loading stream...'}
            </span>
          </div>
        )}

        {/* Final Error Overlay when both Direct & Proxy fail */}
        {errorState && (
          <div className="absolute inset-0 bg-[#090B10]/95 flex flex-col items-center justify-center p-4 text-center z-20">
            <div className="w-11 h-11 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-2.5">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <p className="text-sm sm:text-base font-bold text-white max-w-md">
              Channel is offline or source is blocked.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                type="button"
                onClick={handleManualRetry}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              {onSelectNextChannel && (
                <button
                  type="button"
                  onClick={onSelectNextChannel}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-slate-950"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span>Try Another Channel</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Player Controls Bar */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 py-2.5 flex items-center justify-between gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlayPause}
              className="w-8 h-8 rounded-xl bg-white/15 hover:bg-orange-500 hover:text-slate-950 text-white flex items-center justify-center transition-all"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>

            <div className="flex items-center gap-1.5 bg-white/10 rounded-xl px-2 py-1">
              <button
                type="button"
                onClick={toggleMute}
                className="text-slate-200 hover:text-white"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-red-400" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-14 sm:w-20 accent-orange-500 cursor-pointer h-1 bg-slate-600 rounded-lg"
                aria-label="Volume"
              />
            </div>

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 text-[10px] font-bold">
              <Radio className="w-3 h-3 text-red-400" />
              LIVE
            </span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-all"
            aria-label="Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Prominent Quality Selector */}
      <QualitySelector
        availableQualities={availableQualities}
        selectedQuality={selectedQuality}
        activeAutoLabel={activeAutoLabel}
        isSwitchingLevel={isSwitchingLevel}
        isSingleOrLowQuality={isSingleOrLowQuality}
        onSelectQuality={handleSelectQuality}
      />
    </section>
  );
}
