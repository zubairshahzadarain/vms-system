import Hls from 'hls.js';
import { useEffect, useRef } from 'react';
import { TOKEN_KEY } from '../lib/api';

/**
 * Low-latency-ish HLS live player. Uses hls.js (MSE) everywhere it's supported,
 * falling back to native HLS (Safari). Auth rides on the vms_token cookie plus
 * a Bearer header for hls.js XHRs.
 */
export default function HlsPlayer({
  src,
  className,
  onFatal,
  videoRef: externalRef,
}: {
  src: string;
  className?: string;
  onFatal?: () => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
}) {
  const internalRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalRef ?? internalRef;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let destroyed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const start = () => {
      if (destroyed) return;
      if (Hls.isSupported()) {
        hls = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 3,
          maxLiveSyncPlaybackRate: 1.5,
          fragLoadingMaxRetry: 6,
          manifestLoadingMaxRetry: 8,
          manifestLoadingRetryDelay: 2000,
          xhrSetup: (xhr) => {
            const token = localStorage.getItem(TOKEN_KEY);
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.withCredentials = true;
          },
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => undefined));
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls?.destroy();
            hls = null;
            retryTimer = setTimeout(start, 4000);
            onFatal?.();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
          } else {
            hls?.destroy();
            hls = null;
            retryTimer = setTimeout(start, 6000);
            onFatal?.();
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        void video.play().catch(() => undefined);
      }
    };

    start();
    return () => {
      destroyed = true;
      if (retryTimer) clearTimeout(retryTimer);
      hls?.destroy();
    };
  }, [src, onFatal, videoRef]);

  return <video ref={videoRef} muted playsInline autoPlay className={className} />;
}
