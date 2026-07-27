import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

export function spawnFfmpeg(args: string[]): ChildProcessWithoutNullStreams {
  return spawn(FFMPEG, args, { stdio: ['pipe', 'pipe', 'pipe'] });
}

/** Run a command to completion with a hard timeout. Resolves with stdout+stderr. */
export function runProcess(
  bin: string,
  args: string[],
  timeoutMs: number,
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, timeoutMs);
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
    proc.on('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + '\nspawn error', timedOut });
    });
  });
}

/** ffprobe a source (RTSP url or file). Returns stream info or throws. */
export async function probe(
  input: string,
  opts: { rtsp?: boolean; timeoutMs?: number } = {},
): Promise<{ codec: string; width: number; height: number; fps: number; duration?: number }> {
  const args = [
    '-v',
    'error',
    ...(opts.rtsp ? ['-rtsp_transport', 'tcp'] : []),
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,width,height,avg_frame_rate:format=duration',
    '-of',
    'json',
    input,
  ];
  const res = await runProcess(FFPROBE, args, opts.timeoutMs ?? 15000);
  if (res.timedOut) throw new Error('Connection timed out');
  if (res.code !== 0) {
    throw new Error(res.stderr.trim().split('\n').pop() || 'Unable to probe source');
  }
  const parsed = JSON.parse(res.stdout);
  const stream = parsed.streams?.[0];
  if (!stream) throw new Error('No video stream found');
  let fps = 0;
  if (stream.avg_frame_rate && stream.avg_frame_rate !== '0/0') {
    const [num, den] = stream.avg_frame_rate.split('/').map(Number);
    if (den) fps = Math.round((num / den) * 100) / 100;
  }
  const duration = parsed.format?.duration ? parseFloat(parsed.format.duration) : undefined;
  return { codec: stream.codec_name, width: stream.width, height: stream.height, fps, duration };
}

export function liveHlsArgs(rtspUrl: string, outDir: string, transcode: boolean, fps: number) {
  const video = transcode
    ? [
        '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
        '-profile:v', 'main', '-g', String(Math.max(2, fps) * 2), '-sc_threshold', '0', '-b:v', '2M',
      ]
    : ['-c:v', 'copy'];
  return [
    '-hide_banner', '-loglevel', 'warning',
    '-rtsp_transport', 'tcp',
    '-timeout', '15000000',
    '-fflags', 'nobuffer',
    '-i', rtspUrl,
    '-an',
    ...video,
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+independent_segments+program_date_time',
    '-hls_segment_filename', `${outDir}/seg_%05d.ts`,
    `${outDir}/index.m3u8`,
  ];
}

export function recordSegmentArgs(
  rtspUrl: string,
  outDir: string,
  prefix: string,
  segmentSeconds: number,
) {
  return [
    '-hide_banner', '-loglevel', 'warning',
    '-rtsp_transport', 'tcp',
    '-timeout', '15000000',
    '-i', rtspUrl,
    '-an',
    '-c:v', 'copy',
    '-f', 'segment',
    '-segment_time', String(segmentSeconds),
    '-reset_timestamps', '1',
    '-segment_format', 'mp4',
    '-segment_format_options', 'movflags=+faststart',
    '-strftime', '1',
    `${outDir}/${prefix}_%Y%m%d-%H%M%S.mp4`,
  ];
}

export function motionDetectArgs(rtspUrl: string, threshold: number) {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-rtsp_transport', 'tcp',
    '-timeout', '15000000',
    '-i', rtspUrl,
    '-vf', `fps=3,scale=320:-1,select=gt(scene\\,${threshold}),metadata=print:file=-`,
    '-an',
    '-f', 'null',
    '-',
  ];
}

export function snapshotArgs(rtspUrl: string, outFile: string) {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-rtsp_transport', 'tcp',
    '-timeout', '10000000',
    '-i', rtspUrl,
    '-frames:v', '1',
    '-q:v', '2',
    '-y',
    outFile,
  ];
}

export function keyframeArgs(inputFile: string, outPattern: string, intervalSeconds: number) {
  return [
    '-hide_banner', '-loglevel', 'error',
    '-i', inputFile,
    '-vf', `fps=1/${intervalSeconds},scale=320:-1`,
    '-q:v', '5',
    '-y',
    outPattern,
  ];
}
