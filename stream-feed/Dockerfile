FROM alpine:3.20
RUN apk add --no-cache ffmpeg
COPY publish.sh /publish.sh
RUN chmod +x /publish.sh
ENTRYPOINT ["/publish.sh"]
