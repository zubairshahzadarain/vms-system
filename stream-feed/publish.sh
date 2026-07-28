#!/bin/sh
# Publishes 4 synthetic "IP camera" RTSP feeds into the mediamtx simulator so
# the VMS has real streams to connect to without any physical hardware.
# Each camera uses a visually distinct lavfi source so they're easy to tell
# apart on the live wall; cam2 is intentionally static (no motion) to match
# its motionDetection=false seed setting.
set -u

HOST="${MEDIAMTX_HOST:-simulator}"
PORT="${MEDIAMTX_PORT:-8554}"

publish() {
  path="$1"
  source="$2"
  while true; do
    echo "[stream-feed] (re)starting rtsp://${HOST}:${PORT}/${path} <- ${source}"
    ffmpeg -hide_banner -loglevel error -re \
      -f lavfi -i "$source" \
      -c:v libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p -g 30 \
      -f rtsp -rtsp_transport tcp "rtsp://${HOST}:${PORT}/${path}"
    echo "[stream-feed] ${path} exited, retrying in 2s"
    sleep 2
  done
}

# Relays an external network source (HLS, another RTSP, etc.) into the
# simulator as an RTSP path — re-encodes for a clean, glitch-free RTSP mux
# regardless of the source's keyframe/GOP structure. Optional: only used when
# EXTERNAL_RELAY_URL is set (kept out of the default/seeded demo config).
relay() {
  path="$1"
  url="$2"
  while true; do
    src="$url"
    # Page URLs (e.g. a public YouTube webcam) aren't direct streams — resolve
    # them to a media manifest first. Re-resolved on every retry because these
    # signed URLs expire after a while.
    case "$url" in
      *youtube.com/*|*youtu.be/*)
        echo "[stream-feed] resolving stream URL for ${path}…"
        src="$(yt-dlp -q --no-warnings -f 'best[protocol^=m3u8]/best' -g "$url" 2>/dev/null | head -n 1)"
        if [ -z "$src" ]; then
          echo "[stream-feed] ${path}: could not resolve stream URL, retrying in 30s"
          sleep 30
          continue
        fi
        ;;
    esac

    echo "[stream-feed] (re)starting relay rtsp://${HOST}:${PORT}/${path}"
    # No -re here: a live HLS input is already paced by the source; -re would
    # accumulate drift (ever-growing latency + stutter). Downscale to 720p and
    # cap bitrate so the encode keeps up in real time and downstream pipelines
    # (browser HLS, recording, motion) stay light.
    ffmpeg -hide_banner -loglevel error \
      -i "$src" \
      -an -vf "scale=1280:-2" \
      -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
      -b:v 1500k -maxrate 2000k -bufsize 3000k -g 48 \
      -f rtsp -rtsp_transport tcp "rtsp://${HOST}:${PORT}/${path}"
    echo "[stream-feed] ${path} relay exited, retrying in 5s"
    sleep 5
  done
}

# cam2 stays fully static on purpose: it's seeded with motionDetection=false,
# so one visibly still feed demonstrates the contrast. cam3/cam4 (motion
# detection on) get animated sources so motion events fire naturally.
publish cam1 "testsrc2=size=1280x720:rate=15"   &
publish cam2 "smptehdbars=size=1280x720:rate=15" &
publish cam3 "gradients=size=1280x720:rate=15:speed=0.3" &
publish cam4 "color=c=0x0e1826:size=1280x720:rate=15[bg];color=c=orange:size=120x120:rate=15[fg];[bg][fg]overlay=x='(W-w)*(0.5+0.5*sin(t/2))':y='(H-h)*(0.5+0.5*cos(t/3))'" &

if [ -n "${EXTERNAL_RELAY_URL:-}" ]; then
  relay external1 "$EXTERNAL_RELAY_URL" &
fi

wait
