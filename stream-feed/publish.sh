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

publish cam1 "testsrc2=size=1280x720:rate=15"   &
publish cam2 "smptehdbars=size=1280x720:rate=15" &
publish cam3 "yuvtestsrc=size=1280x720:rate=15"  &
publish cam4 "rgbtestsrc=size=1280x720:rate=15"  &

wait
