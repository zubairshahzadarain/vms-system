FROM alpine:3.20
# yt-dlp resolves page URLs (e.g. public YouTube webcams) to a direct stream
# manifest; only used when EXTERNAL_RELAY_URL points at such a page.
RUN apk add --no-cache ffmpeg yt-dlp
COPY publish.sh /publish.sh
RUN chmod +x /publish.sh
ENTRYPOINT ["/publish.sh"]
