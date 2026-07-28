# VMS — Video Management System

A web-based Video Management System for a centralized security command center: multi-camera live monitoring, continuous/manual/event recording with an intelligent keyframe timeline, role-based access control, real-time event management, and full-text search — all deployable with a single `docker compose up`.

Built for the Zenith Technologies Senior Full-Stack Developer technical assignment.

**Live demo (Azure):** https://vms-frontend.blackflower-76a41e27.eastus2.azurecontainerapps.io/login · demo login `admin` / `Admin@123` · [Swagger API docs](https://vms-backend.blackflower-76a41e27.eastus2.azurecontainerapps.io/api/docs)

![VMS Dashboard](docs/screenshots/dashboard.png)
*Dashboard: live camera health, storage quota with automatic retention, and the real-time event feed.*

---

## Contents

- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Architecture](#architecture)
- [Technology choices](#technology-choices--why)
- [Feature checklist](#feature-checklist)
- [Project structure](#project-structure)
- [Configuration](#configuration-env)
- [API documentation](#api-documentation)
- [Connecting real cameras](#connecting-real-cameras)
- [Local development (without Docker)](#local-development-without-docker)
- [Known limitations](#known-limitations)
- [Roadmap: AI analytics](#roadmap-ai-video-analytics)

---

## Quick start

Requirements: Docker Desktop (or Docker Engine + Compose v2). Nothing else — no Node, no Postgres, no FFmpeg needed on the host.

```bash
git clone <this-repo>
cd videotask
cp .env.example .env      # optional — sensible defaults are baked in
docker compose up -d --build
```

That single command starts 5 containers:

| Service | Role |
|---|---|
| `db` | PostgreSQL 16 |
| `simulator` | MediaMTX RTSP server |
| `stream-feed` | Publishes 4 synthetic "IP camera" streams into `simulator` — no real camera required |
| `backend` | NestJS API + FFmpeg orchestration engine |
| `frontend` | React SPA served by nginx, proxying `/api`, `/media`, `/socket.io` to the backend |

The backend automatically creates the schema and seeds demo users + 4 cameras on first boot.

Open **http://localhost:8080** and sign in (see [demo accounts](#demo-accounts) below). Cameras go from `OFFLINE` to `ONLINE` within ~5–10 seconds as the live HLS pipelines connect.

To stop: `docker compose down` (add `-v` to also wipe the database/media volumes and start completely fresh).

### Health checks

```bash
curl http://localhost:3000/api/health     # backend
docker compose ps                         # all containers should show "healthy" / "running"
```

---

## Demo accounts

Seeded automatically — shown on the login screen for one-click fill:

| Username | Password | Role | Access |
|---|---|---|---|
| `admin` | `Admin@123` | Administrator | Full system administration |
| `operator` | `Operator@123` | Operator | Monitor cameras, playback, manage incidents |
| `viewer` | `Viewer@123` | Viewer | Live view of 2 assigned cameras only (CAM-01, CAM-02) |

---

## Architecture

```
┌─────────────┐   HLS / REST / WebSocket   ┌──────────────────┐
│   Browser   │ ─────────────────────────► │  nginx (frontend) │
│  React SPA  │ ◄───────────────────────── │  static + proxy   │
└─────────────┘                            └─────────┬────────┘
                                                       │ /api /media /socket.io
                                                       ▼
                                            ┌──────────────────────┐
                                            │   NestJS backend      │
                                            │  ─────────────────    │
                                            │  Auth (JWT+RBAC)       │
                                            │  Cameras / Users       │
                                            │  Events / Audit        │
                                            │  Dashboard / Search    │
                                            │  Socket.IO gateway     │
                                            │  ─────────────────    │
                                            │  StreamManagerService  │◄──── orchestrates
                                            │    ├─ live HLS (ffmpeg)│      one FFmpeg
                                            │    ├─ recording (ffmpeg)│     process tree
                                            │    ├─ motion (ffmpeg)  │      per camera
                                            │    └─ keyframes/snap   │
                                            └─────────┬──────────────┘
                                                       │ RTSP (TCP)          │ SQL
                                                       ▼                     ▼
                                            ┌────────────────────┐  ┌───────────────┐
                                            │  MediaMTX simulator │  │  PostgreSQL   │
                                            │  + stream-feed      │  │  (Prisma ORM) │
                                            │  (4 synthetic cams) │  └───────────────┘
                                            └────────────────────┘
```

**Data flow for a camera**: the backend spawns three independent FFmpeg pipelines per enabled camera —

1. **Live**: RTSP → HLS (2s segments, 6-segment sliding window) written to `/media/live/<cameraId>/`, served to the browser via `hls.js`.
2. **Recording**: RTSP → 60s MP4 segments (`-c:v copy`, no re-encode) written to `/media/recordings/<cameraId>/`. On segment rotation, the previous file is probed, persisted to Postgres, and its keyframe thumbnails are extracted.
3. **Motion**: RTSP → FFmpeg's `select=gt(scene,threshold)` scene-change filter. A detection emits a `MOTION_DETECTED` event and — if nothing is already recording — starts an `EVENT` recording that auto-stops 45s after the last motion.

A 5-second interval loop watches each camera's live HLS playlist `mtime` to derive `ONLINE`/`OFFLINE` status and heartbeats, with exponential-backoff auto-reconnect (5s → 60s cap) and `CAMERA_OFFLINE`/`CAMERA_RECONNECTED` events on state changes.

All state changes (camera status, recording status, new events, dashboard stats) are pushed to connected clients over Socket.IO — the dashboard and Command Center never poll for their primary data.

---

## Technology choices — why

No stack was mandated by the assignment ("open-source libraries, public APIs, RTSP sample streams" — Docker + REST docs + README are the only hard requirements). Choices below, with the reasoning:

| Layer | Choice | Why |
|---|---|---|
| Backend | **Node.js 20 + NestJS + TypeScript** | A VMS control plane is I/O- and realtime-heavy (many concurrent streams, WebSocket fan-out, file serving) — exactly Node's strength. NestJS adds RBAC guards, DTO validation, and **auto-generated OpenAPI docs** (a required deliverable) on top of Express, with proper module structure for a system this size. |
| Frontend | **React 18 + Vite + TypeScript + Tailwind** | Standard SPA stack for an authenticated internal ops console. Deliberately **not** Next.js: the entire app sits behind a login with zero SEO/SSR surface, and its core UI (`hls.js` video walls, canvas zoom, live socket feeds) is client-only — Next's main value proposition doesn't apply here, and a Vite SPA ships a 5MB static nginx image instead of running a Node server. |
| Database | **PostgreSQL 16 + Prisma** | Relational model fits cameras/recordings/events/users/audit cleanly; Prisma gives type-safe queries and a single schema file as the source of truth. |
| Video engine | **FFmpeg** | The open-source standard every real VMS (and OSS projects like Frigate/Shinobi) builds on for RTSP ingestion, HLS packaging, segment recording, thumbnailing, and scene-based motion detection. |
| Test streams | **MediaMTX + FFmpeg lavfi sources** | Bundled RTSP server publishing 4 synthetic camera feeds so the whole system is reviewable with zero physical hardware or external accounts. |
| Realtime | **Socket.IO** | Rooms (per-camera, staff-only) map directly onto RBAC scoping; built-in reconnect handling. |
| Deployment | **Docker Compose, 5 services** | One-command reviewer experience; each service is independently rebuildable. |

**Backend is Node.js, not Python.** NestJS runs on the Express adapter under the hood, but is used deliberately over raw Express for its built-in `@Roles()` guards, DTO validation pipes, and Swagger generation — all required or strongly implied by the assignment. Python was considered for the backend and rejected: there's no ML/CV workload today (motion detection is FFmpeg's scene filter, not OpenCV), so it would cost a second language for no benefit. Python earns its place only for the AI analytics extension — see [Roadmap](#roadmap-ai-video-analytics).

---

## Feature checklist

Every item below has been implemented and verified against a running `docker compose` stack (see the project's validation notes for exact evidence — real recorded segments, real keyframe thumbnails, real HLS segment fetches, etc.).

- [x] Secure authentication (JWT, httpOnly cookie + Bearer) & Role-Based Access Control (Admin / Operator / Viewer)
- [x] Dashboard — total/online/offline cameras, active live streams, active recordings, storage usage, recent events, camera health, system uptime, auto-refresh via Socket.IO
- [x] Camera Management — name, location, RTSP URL, group, resolution, FPS, recording status, online/offline status, last heartbeat; add/edit/delete/enable/disable/test connection
- [x] Multi-camera Live View — 1 / 4 / 9 / 16 grid; per-tile name/status/recording indicator/fullscreen/digital zoom/snapshot
- [x] Recording & Playback — continuous, manual, and event-triggered recording; timeline, play/pause, seek, fast-forward, 0.5–4× speed control, snapshot, download
- [x] Keyframe Timeline — thumbnails every 30s (configurable), click-to-jump, fast navigation through long/multi-segment recordings
- [x] Central Command Center — multi-camera wall, live event panel, offline cameras, recording failures, active alarms, storage health, recent incidents, operator activity, all realtime
- [x] Event Management — camera offline/reconnected, motion detected, recording started/stopped/failed, storage full, user login/logout; each with timestamp, camera, severity, description, open/closed status
- [x] Search — cameras, recordings, events, users; filter by date, camera, camera group, status, event type
- [x] Users & Roles — CRUD, role assignment, per-viewer camera access assignment
- [x] Audit Logs — every mutating action logged with actor, action, resource, IP, and sanitized request details
- [x] Docker deployment — `docker compose up`, healthchecks, named volumes for DB + media persistence
- [x] REST API documentation — Swagger/OpenAPI UI at `/api/docs` (30 documented endpoints)
- [x] README with setup instructions (this file)

---

## Project structure

```
videotask/
├── docker-compose.yml
├── .env.example
├── backend/                 # NestJS API
│   ├── prisma/
│   │   ├── schema.prisma    # data model (users, cameras, recordings, events, audit…)
│   │   └── seed.ts          # demo users + 4 cameras
│   └── src/
│       ├── auth/            # JWT login/logout/me
│       ├── cameras/         # CRUD, groups, test-connection
│       ├── streaming/       # StreamManagerService — the FFmpeg orchestration core
│       ├── recordings/      # sessions, segments, export, playback
│       ├── snapshots/
│       ├── events/          # event emission, listing, close
│       ├── dashboard/       # aggregated stats + 5s socket push
│       ├── search/          # unified cross-entity search
│       ├── users/           # admin user management
│       ├── audit/           # audit log + global interceptor
│       ├── realtime/        # Socket.IO gateway (rooms, presence)
│       ├── media/           # protected static file serving (HLS/recordings/snapshots)
│       └── common/          # guards, decorators (Public, Roles, CurrentUser)
├── frontend/                 # React SPA
│   └── src/
│       ├── pages/             # Dashboard, LiveView, Playback, CommandCenter, Cameras,
│       │                       Events, Search, Users, AuditLogs, Login
│       ├── components/        # Layout, CameraTile (zoom/fullscreen/snapshot), HlsPlayer, ui.tsx
│       └── lib/                # api client, socket client, auth context, formatting
├── simulator/                # MediaMTX RTSP server (bare)
└── stream-feed/               # FFmpeg publisher: 4 synthetic camera feeds → simulator
```

---

## Configuration (`.env`)

Copy `.env.example` to `.env` to override any of these (all have working defaults):

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `vms` / `vms_secret` / `vms` | Database credentials |
| `JWT_SECRET` | dev placeholder | **Change in any real deployment** |
| `JWT_EXPIRES_IN` | `12h` | Session length |
| `WEB_PORT` | `8080` | Host port the frontend is exposed on |
| `MAX_STORAGE_GB` | `5` | Retention quota — oldest recordings are pruned above 85% usage |
| `KEYFRAME_INTERVAL_SECONDS` | `30` | Thumbnail sampling interval (30–60 recommended per spec) |
| `SEGMENT_SECONDS` | `60` | Recording segment length |

---

## API documentation

Interactive Swagger UI: **http://localhost:8080/api/docs** (or `:3000/api/docs` direct to the backend).

Every endpoint is grouped by resource (auth, cameras, recordings, events, dashboard, search, users, audit, snapshots) with request/response schemas, and supports "Try it out" using either the `vms_token` cookie set by `/auth/login` or a pasted Bearer token.

---

## Connecting real cameras

The system ships defaulting to the bundled simulator, but works with any RTSP source:

1. Sign in as `admin` → **Cameras** → **Add Camera**.
2. Enter a real RTSP URL (`rtsp://user:pass@host:554/stream`) and click **Test** to confirm codec/resolution/FPS are readable.
3. If the source uses a codec HLS can't play directly in-browser (e.g. H.265), enable **Transcode to H.264**.
4. Save — the live/record/motion pipelines start automatically.

Public RTSP test streams (e.g. Wowza's public demo servers) work for quick testing, but some enforce a **per-stream concurrent-connection limit**; see [Known limitations](#known-limitations).

---

## Local development (without Docker)

Requires Node 20+, PostgreSQL, and FFmpeg on the host.

```bash
# Backend
cd backend
npm install
# set DATABASE_URL in a .env pointing at your local Postgres
npx prisma db push
npm run seed
npm run start:dev          # http://localhost:3000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173, proxies /api,/media,/socket.io to :3000
```

---

## Known limitations

- **Public demo RTSP servers with connection limits.** The backend opens up to three independent upstream RTSP connections per camera (live view, recording, motion detection). Some free/shared public demo endpoints (e.g. certain Wowza demo servers) cap concurrent sessions per stream path and will reset the connection under this load, producing a reconnect loop. This was reproduced and confirmed during testing — a single connection to the same URL was stable. **The bundled simulator has no such limit** and is the recommended path for reliable extended demos; dedicated/real IP cameras (the system's actual target) don't have this constraint either, since supporting multiple concurrent viewers is a basic requirement of that hardware.
- **HLS live latency is ~4–6 seconds** (2s segments × ~2–3 segment buffer), typical for HLS. Sub-second latency would require switching the live path to WebRTC (see roadmap).
- **Snapshot browsing** — capture and download both work (from Live View tiles and the Playback player) and the API supports listing (`GET /api/snapshots`), but there isn't yet a dedicated gallery page in the UI.
- **Single-node deployment** — recordings live on a local Docker volume, not object storage; fine for this assignment's scope, not for multi-site production (see roadmap).

---

## Roadmap: AI video analytics

Object detection, ANPR, or face-watchlist matching were out of scope for this assignment but the system is deliberately shaped to add them without a rewrite:

```
Camera RTSP ──┬──► existing Node pipeline (live / record / motion / events)
              │
              └──► new Python microservice (YOLO/DeepStream)
                        │ POST detection → same Events API used today
                        ▼
                   command center, alarms, event-recording, search
                   (zero changes needed — the pipeline already exists)
```

- **Detection plane**: Python + PyTorch (YOLOv8/v11) for object/person detection; ByteTrack for cross-frame tracking so one object doesn't spam ten alerts. NVIDIA DeepStream/TensorRT if scaling past ~40 concurrent streams on a single GPU.
- **Integration seam**: a new `EventType` (e.g. `PERSON_DETECTED`) posted to the existing `/events` pipeline — it already drives the Command Center feed, alarms, and event-triggered recording, so the UI needs zero changes for detections to appear.
- **Live-overlay timing**: HLS's ~4–6s latency means naively drawn bounding boxes would appear before the subject is on screen. Fix by aligning on the `#EXT-X-PROGRAM-DATE-TIME` tags FFmpeg already emits, or — the more correct long-term fix — move live view to **WebRTC via MediaMTX** (already in the stack) for sub-second, naturally-synced latency.
- **Scale-out**: local disk → S3/MinIO for segments; Postgres → TimescaleDB for high-volume events; in-process → NATS/Kafka event bus; single node → Kubernetes with edge recorder nodes for multi-site deployments.
