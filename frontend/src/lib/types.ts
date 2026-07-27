export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER';
export type CameraStatus = 'ONLINE' | 'OFFLINE' | 'DISABLED';
export type RecordingType = 'CONTINUOUS' | 'MANUAL' | 'EVENT';
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';
export type EventStatus = 'OPEN' | 'CLOSED';
export type EventType =
  | 'CAMERA_OFFLINE'
  | 'CAMERA_RECONNECTED'
  | 'MOTION_DETECTED'
  | 'RECORDING_STARTED'
  | 'RECORDING_STOPPED'
  | 'RECORDING_FAILURE'
  | 'STORAGE_FULL'
  | 'USER_LOGIN'
  | 'USER_LOGOUT';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  assignedCameras?: { id: string; name: string }[];
  assignedCameraIds?: string[];
}

export interface CameraGroup {
  id: string;
  name: string;
  _count?: { cameras: number };
}

export interface Camera {
  id: string;
  name: string;
  location: string;
  rtspUrl?: string;
  groupId?: string | null;
  group?: CameraGroup | null;
  resolution: string;
  fps: number;
  isEnabled: boolean;
  status: CameraStatus;
  lastHeartbeat?: string | null;
  transcode: boolean;
  motionDetection: boolean;
  continuousRecording: boolean;
  isRecording?: boolean;
  recordingType?: RecordingType | null;
  hlsUrl?: string;
}

export interface Keyframe {
  id: string;
  recordingId: string;
  cameraId: string;
  timestamp: string;
  filename: string;
  url: string;
}

export interface Recording {
  id: string;
  sessionId: string;
  cameraId: string;
  camera?: { id: string; name: string };
  type: RecordingType;
  filename: string;
  startedAt: string;
  endedAt: string;
  duration: number;
  fileSize: number;
  url: string;
  keyframes?: Keyframe[];
}

export interface RecordingSession {
  id: string;
  cameraId: string;
  camera?: { id: string; name: string; location?: string };
  type: RecordingType;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  endedAt?: string | null;
  recordings?: Recording[];
  totalDuration?: number;
  totalBytes?: number;
  _count?: { recordings: number };
}

export interface VmsEvent {
  id: string;
  type: EventType;
  severity: Severity;
  status: EventStatus;
  cameraId?: string | null;
  camera?: { id: string; name: string; location?: string } | null;
  userId?: string | null;
  user?: { id: string; username: string; fullName?: string } | null;
  description: string;
  createdAt: string;
  closedAt?: string | null;
  closedBy?: { id: string; username: string } | null;
}

export interface Snapshot {
  id: string;
  cameraId: string;
  camera?: { id: string; name: string };
  user?: { id: string; username: string };
  filename: string;
  source: string;
  createdAt: string;
  url: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  user?: { id: string; username: string; fullName: string; role: Role };
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

export interface StorageStats {
  usedBytes: number;
  byCategory: Record<string, number>;
  diskTotalBytes: number;
  diskFreeBytes: number;
  quotaBytes: number;
  usedPercentOfQuota: number;
}

export interface Presence {
  userId: string;
  username: string;
  fullName: string;
  role: Role;
  connectedAt: string;
}

export interface DashboardStats {
  cameras: { total: number; online: number; offline: number; disabled: number };
  activeLiveStreams: number;
  activeRecordings: { cameraId: string; type: RecordingType }[];
  recordingsToday: { segments: number; bytes: number; seconds: number };
  storage: StorageStats;
  events: { open: number; openCritical: number; openWarning: number; last24h: number };
  recentEvents: VmsEvent[];
  cameraHealth: (Pick<
    Camera,
    'id' | 'name' | 'location' | 'status' | 'lastHeartbeat' | 'isEnabled' | 'fps' | 'resolution'
  > & { isRecording: boolean; recordingType: RecordingType | null })[];
  activeUsers: Presence[];
  system: {
    uptimeSeconds: number;
    hostUptimeSeconds: number;
    loadAvg: number[];
    memory: { total: number; free: number };
    now: string;
  };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
