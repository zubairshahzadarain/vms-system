FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build
# Compile the seed script to plain JS too (nest build only compiles src/) so
# the container can run it with plain `node` — no ts-node needed at runtime.
RUN npx tsc prisma/seed.ts --outDir dist --rootDir . --module commonjs --target ES2022 --esModuleInterop --skipLibCheck --resolveJsonModule

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV MEDIA_ROOT=/app/media

# ffmpeg/ffprobe power every video pipeline (live HLS, recording, snapshots,
# keyframes, motion detection); postgresql-client is handy for debugging.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      openssl \
      curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
COPY tsconfig.json ./
# Full install (not --omit=dev): the entrypoint runs `prisma db push`
# at container start, a dev dependency.
RUN npm install && npx prisma generate

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/media
VOLUME ["/app/media"]

EXPOSE 3000
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
