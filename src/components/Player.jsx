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
  Zap,
} from 'lucide-react';
import QualitySelector, {
  STANDARD_QUALITY_TIERS,
  resolveQualityTierLabel,
} from './QualitySelector';
import { getChannelInitials } from '../utils/m3uParser';

/**
 * Exact Cloudflare Worker Proxy Base URL.
 */
export const CORS_PROXY_BASE_URL = 'https://brinetv-proxy.brinetube.workers.dev';

const DIRECT_TIMEOUT_MS = 4500;
const PROXY_TIMEOUT_MS = 8000;
const FORCED_DIRECT_TIMEOUT_MS = 10000;

/**
 * Encodes an original stream URL into the Cloudflare Worker Proxy URL format:
 * https://brinetv-proxy.brinetube.workers.dev/?url=${encodeURIComponent(originalStreamUrl)}
 */
export function buildProxyStreamUrl(originalStreamUrl) {
  if (!originalStreamUrl) return '';
  const trimmed = String(originalStreamUrl).trim();
  if (trimmed.startsWith(CORS_PROXY_BASE_URL)) {
    return trimmed;
  }
  return `${CORS_PROXY_BASE_URL}/?url=${encodeURIComponent(trimmed)}`;
}

/**
 * Resolves any relative or un-proxied segment/playlist URL requested by hls.js
 * when playing through the Cloudflare Worker proxy.
 */
export function resolveProxiedRequestUrl(requestedUrl, currentUpstreamBaseUrl) {
  if (!requestedUrl) return requestedUrl;

  if (
    requestedUrl.startsWith(`${CORS_PROXY_BASE_URL}/?url=`) ||
    requestedUrl.startsWith(`${CORS_PROXY_BASE_URL}?url=`)
  ) {
    return requestedUrl;
  }

  if (requestedUrl.startsWith(CORS_PROXY_BASE_URL)) {
    const relativePathWithQuery = requestedUrl
      .slice(CORS_PROXY_BASE_URL.length)
      .replace(/^\/+/, '');
    try {
      const realUpstreamUrl = new URL(relativePathWithQuery, currentUpstreamBaseUrl).href;
      return buildProxyStreamUrl(realUpstreamUrl);
    } catch (_err) {
      return requestedUrl;
    }
  }

  if (/^https?:\/\//i.test(requestedUrl)) {
    return buildProxyStreamUrl(requestedUrl);
  }

  try {
    const realUpstreamUrl = new URL(requestedUrl, currentUpstreamBaseUrl).href;
    return buildProxyStreamUrl(realUpstreamUrl);
  } catch (_err) {
    return requestedUrl;
  }
}

/**
 * Brinetv Live Video Player Component (V6).
 *
 * Key Features:
 * 1. Smart Direct -> Proxy Fallback: Tries direct stream first; if CORS/network error occurs,
 *    automatically retries through https://brinetv-proxy.brinetube.workers.dev/?url=...
 * 2. 'Try Direct Stream' Fallback Button: If the Worker proxy is blocked by an IPTV server's
 *    Cloudflare IP filter, the user gets a 'Try Direct Stream' button to bypass the Worker.
 * 3. Smooth Quality Switching: Extracts all available qualities (144p..1080p) from `hls.levels`
 *    on both MANIFEST_PARSED and LEVEL_LOADED, and uses `hls.nextLevel` / `hls.loadLevel` for
 *    smooth, buffer-safe resolution switching.
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
  const stageTimeoutRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [errorState, setErrorState] = useState(null);
  const [logoError, setLogoError] = useState(false);

  // 'direct' | 'proxy' | 'forced-direct'
  const [streamStage, setStreamStage] = useState('direct');
  // null = auto (Direct -> Proxy fallback), 'direct' = Try Direct Stream, 'proxy' = Force Proxy
  const [manualMode, setManualMode] = useState(null);

  const [availableQualities, setAvailableQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState('Auto');
  const [activeAutoLabel, setActiveAutoLabel] = useState(null);
  const [isSwitchingLevel, setIsSwitchingLevel] = useState(false);
  const [isSingleOrLowQuality, setIsSingleOrLowQuality] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const clearStageTimeout = useCallback(() => {
    if (stageTimeoutRef.current) {
      clearTimeout(stageTimeoutRef.current);
      stageTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setLogoError(false);
    setManualMode(null);
  }, [channel?.id, channel?.logo]);

  /**
   * Extracts available qualities (144p..1080p) from `hls.levels`.
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
   * Syncs `hls.levels` into state (called on MANIFEST_PARSED and LEVEL_LOADED).
   */
  const syncQualitiesFromHls = useCallback(
    (hlsInstance) => {
      if (!hlsInstance || !Array.isArray(hlsInstance.levels)) return;
      const levels = hlsInstance.levels;
      const qualities = extractAvailableQualities(levels);
      setAvailableQualities(qualities);

      if (qualities.length <= 1) {
        setIsSingleOrLowQuality(true);
        if (qualities.length === 1) {
          setActiveAutoLabel(qualities[0].label);
        }
      } else {
        const maxHeight = Math.max(...levels.map((l) => Number(l.height) || 0));
        setIsSingleOrLowQuality(maxHeight > 0 && maxHeight <= 360);
      }
    },
    [extractAvailableQualities]
  );

  /**
   * Unified Stream Loader Effect.
   */
  useEffect(() => {
    const video = videoRef.current;
    const originalStreamUrl = channel?.streamUrl?.trim();
    if (!video || !originalStreamUrl) return undefined;

    let isCancelled = false;

    const cleanupHls = () => {
      clearStageTimeout();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const startStage = (stage) => {
      if (isCancelled) return;
      cleanupHls();

      const isProxyStage = stage === 'proxy';
      const isForcedDirect = stage === 'forced-direct';

      setStreamStage(stage);
      setErrorState(null);
      setIsBuffering(true);
      setIsPlaying(false);
      setAvailableQualities([]);
      setSelectedQuality('Auto');
      setActiveAutoLabel(null);
      setIsSwitchingLevel(false);
      setIsSingleOrLowQuality(false);

      const sourceUrlToLoad = isProxyStage
        ? buildProxyStreamUrl(originalStreamUrl)
        : originalStreamUrl;

      let stageHasSucceeded = false;
      let activeUpstreamBaseUrl = originalStreamUrl;

      const markStageSuccess = () => {
        if (isCancelled) return;
        stageHasSucceeded = true;
        clearStageTimeout();
        setIsBuffering(false);
      };

      const handleStageFailure = () => {
        if (isCancelled) return;
        cleanupHls();

        // If auto-mode Direct stage failed, automatically try Cloudflare Worker Proxy
        if (stage === 'direct') {
          startStage('proxy');
          return;
        }

        // If Proxy (or Forced Direct) failed, show error state with 'Try Direct Stream' option
        video.removeAttribute('src');
        video.load();
        setIsBuffering(false);
        setIsSwitchingLevel(false);
        setErrorState('Channel is offline or source is blocked.');
      };

      const timeoutDuration = isProxyStage
        ? PROXY_TIMEOUT_MS
        : isForcedDirect
        ? FORCED_DIRECT_TIMEOUT_MS
        : DIRECT_TIMEOUT_MS;

      stageTimeoutRef.current = setTimeout(() => {
        if (!stageHasSucceeded && !isCancelled) {
          handleStageFailure();
        }
      }, timeoutDuration);

      const isMp4 = /\.(mp4|webm|ogg)(\?.*)?$/i.test(originalStreamUrl);

      if (isMp4) {
        setIsSingleOrLowQuality(true);
        video.src = sourceUrlToLoad;
        video.load();
        video
          .play()
          .then(() => {
            markStageSuccess();
            setIsPlaying(true);
          })
          .catch(() => {
            video.muted = true;
            setIsMuted(true);
            video
              .play()
              .then(() => {
                markStageSuccess();
                setIsPlaying(true);
              })
              .catch(() => {});
          });
        return;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          startLevel: -1,
          capLevelToPlayerSize: true,
          manifestLoadingTimeOut: isProxyStage ? 7000 : isForcedDirect ? 8000 : 3500,
          manifestLoadingMaxRetry: isProxyStage || isForcedDirect ? 1 : 0,
          levelLoadingTimeOut: isProxyStage ? 7000 : isForcedDirect ? 8000 : 3500,
          levelLoadingMaxRetry: isProxyStage || isForcedDirect ? 1 : 0,
          fragLoadingTimeOut: isProxyStage ? 7000 : isForcedDirect ? 8000 : 3500,
          fragLoadingMaxRetry: isProxyStage || isForcedDirect ? 1 : 0,
          xhrSetup: (xhr, url) => {
            if (!isProxyStage) return;
            const proxiedUrl = resolveProxiedRequestUrl(url, activeUpstreamBaseUrl);
            try {
              const parsedProxy = new URL(proxiedUrl);
              const innerUrl = parsedProxy.searchParams.get('url');
              if (innerUrl && /\.m3u8(\?.*)?$/i.test(innerUrl)) {
                activeUpstreamBaseUrl = innerUrl;
              }
            } catch (_err) {
              // Ignore URL parse error
            }
            if (proxiedUrl !== url) {
              xhr.open('GET', proxiedUrl, true);
            }
          },
        });
        hlsRef.current = hls;

        hls.loadSource(sourceUrlToLoad);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (isCancelled) return;
          syncQualitiesFromHls(hls);

          video
            .play()
            .then(() => {
              markStageSuccess();
              setIsPlaying(true);
            })
            .catch(() => {
              video.muted = true;
              setIsMuted(true);
              video
                .play()
                .then(() => {
                  markStageSuccess();
                  setIsPlaying(true);
                })
                .catch(() => {});
            });
        });

        // Re-sync levels on LEVEL_LOADED in case variant resolution metadata was populated late
        hls.on(Hls.Events.LEVEL_LOADED, () => {
          if (isCancelled) return;
          syncQualitiesFromHls(hls);
        });

        hls.on(Hls.Events.LEVEL_SWITCHING, () => {
          if (isCancelled) return;
          setIsSwitchingLevel(true);
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          if (isCancelled) return;
          setIsSwitchingLevel(false);
          setIsBuffering(false);
          const currentIdx = data?.level;
          if (typeof currentIdx === 'number' && hls.levels[currentIdx]) {
            const label = resolveQualityTierLabel(hls.levels[currentIdx]);
            setActiveAutoLabel(label);
          }
        });

        hls.on(Hls.Events.FRAG_LOADED, () => {
          markStageSuccess();
          setIsSwitchingLevel(false);
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (isCancelled) return;

          if (stage === 'direct' && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            handleStageFailure();
            return;
          }

          if (!data.fatal) {
            if (
              data.details === Hls.ErrorDetails.LEVEL_SWITCH_ERROR ||
              data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR ||
              data.details === Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT
            ) {
              setIsSwitchingLevel(false);
              setIsBuffering(false);
              hls.nextLevel = -1;
              hls.currentLevel = -1;
              setSelectedQuality('Auto');
            }
            return;
          }

          handleStageFailure();
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        setIsSingleOrLowQuality(true);
        video.src = sourceUrlToLoad;
        const onLoadedMeta = () => {
          markStageSuccess();
          video.play().catch(() => {});
        };
        video.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
      } else {
        handleStageFailure();
      }
    };

    if (manualMode === 'direct') {
      startStage('forced-direct');
    } else if (manualMode === 'proxy') {
      startStage('proxy');
    } else {
      startStage('direct');
    }

    return () => {
      isCancelled = true;
      cleanupHls();
    };
  }, [
    channel?.id,
    channel?.streamUrl,
    manualMode,
    reloadNonce,
    syncQualitiesFromHls,
    clearStageTimeout,
  ]);

  /**
   * Smooth Quality Switcher using `hls.nextLevel` & `hls.loadLevel`
   * so resolution transitions happen cleanly without black-screen drops.
   */
  const handleSelectQuality = useCallback((qualityLabel, levelIndex) => {
    const hls = hlsRef.current;
    if (!hls) return;

    if (qualityLabel === 'Auto' || levelIndex === -1) {
      setSelectedQuality('Auto');
      setIsSwitchingLevel(true);
      hls.nextLevel = -1;
      hls.loadLevel = -1;
      setTimeout(() => {
        setIsSwitchingLevel(false);
      }, 350);
      return;
    }

    setSelectedQuality(qualityLabel);
    setActiveAutoLabel(qualityLabel);
    setIsSwitchingLevel(true);

    try {
      // Smooth switch at next segment boundary via nextLevel + loadLevel
      hls.nextLevel = levelIndex;
      hls.loadLevel = levelIndex;
    } catch (_err) {
      hls.nextLevel = -1;
      setSelectedQuality('Auto');
      setIsSwitchingLevel(false);
    }
  }, []);

  /**
   * Switches immediately to Direct Stream (bypassing Cloudflare Worker IP blocks).
   */
  const handleTryDirectStream = () => {
    setErrorState(null);
    setManualMode('direct');
    setReloadNonce((n) => n + 1);
  };

  /**
   * Retries via Cloudflare Worker Proxy.
   */
  const handleRetryProxy = () => {
    setErrorState(null);
    setManualMode('proxy');
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
  const isUsingProxy = streamStage === 'proxy';

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

              {/* Mode Status Pill & Quick 'Try Direct Stream' Switcher */}
              {isUsingProxy ? (
                <button
                  type="button"
                  onClick={handleTryDirectStream}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-500/15 hover:bg-emerald-500/20 text-cyan-300 hover:text-emerald-300 border border-cyan-500/30 transition-colors shrink-0"
                  title="Currently using Proxy. Click to Try Direct Stream."
                >
                  <ShieldCheck className="w-3 h-3 text-cyan-400" />
                  <span>Proxy · Try Direct Stream</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRetryProxy}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 hover:bg-cyan-500/20 text-emerald-300 hover:text-cyan-300 border border-emerald-500/30 transition-colors shrink-0"
                  title="Currently playing Direct stream. Click to switch to Proxy."
                >
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>Direct</span>
                </button>
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
            clearStageTimeout();
            setIsPlaying(true);
            setIsBuffering(false);
            setIsSwitchingLevel(false);
          }}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onError={() => {
            clearStageTimeout();
            if (streamStage === 'direct') {
              setManualMode('proxy');
              setReloadNonce((n) => n + 1);
            } else {
              setIsBuffering(false);
              setIsSwitchingLevel(false);
              setErrorState('Channel is offline or source is blocked.');
            }
          }}
        />

        {/* Buffering Spinner */}
        {(isBuffering || isSwitchingLevel) && !errorState && (
          <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-2 pointer-events-none z-10">
            <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
            <span className="text-xs font-medium text-slate-200 bg-slate-900/90 px-3 py-1 rounded-full border border-slate-800">
              {isSwitchingLevel
                ? 'Switching quality...'
                : isUsingProxy
                ? 'Loading via Smart Proxy...'
                : 'Loading direct stream...'}
            </span>
          </div>
        )}

        {/* Error Overlay with 'Try Direct Stream' Fallback Button */}
        {errorState && (
          <div className="absolute inset-0 bg-[#090B10]/95 flex flex-col items-center justify-center p-4 text-center z-20">
            <div className="w-11 h-11 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center mb-2.5">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <p className="text-sm sm:text-base font-bold text-white max-w-md">
              Channel is offline or source is blocked.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {/* Prominent 'Try Direct Stream' Button when Worker fails */}
              <button
                type="button"
                onClick={handleTryDirectStream}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Try Direct Stream</span>
              </button>

              <button
                type="button"
                onClick={handleRetryProxy}
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
