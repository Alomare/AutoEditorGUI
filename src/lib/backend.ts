// Typed wrappers around the Rust commands and events.

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface AppPaths {
  root: string;
  exeDir: string;
  bin: string;
  data: string;
  models: string;
  portable: boolean;
}

export interface AppInfo {
  version: string;
  os: string;
  arch: string;
  paths: AppPaths;
  launchFiles: string[];
}

export interface ToolInfo {
  path: string;
  version: string | null;
  source: 'custom' | 'bundled' | 'path';
}

export interface CaptureResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
}

export interface Release {
  tag_name: string;
  published_at: string | null;
  html_url: string;
  assets: { name: string; browser_download_url: string; size: number }[];
}

export const appInfo = () => invoke<AppInfo>('app_info');

export const locateTool = (name: string, custom?: string) =>
  invoke<ToolInfo | null>('locate_tool', { name, custom: custom || null });

export const readText = (path: string) => invoke<string | null>('read_text', { path });
export const writeText = (path: string, contents: string) => invoke<void>('write_text', { path, contents });
export const removeFile = (path: string) => invoke<void>('remove_file', { path });
export const listFiles = (dir: string, extensions: string[] = []) => invoke<FileEntry[]>('list_files', { dir, extensions });
export const pathExists = (path: string) => invoke<boolean>('path_exists', { path });

export const runCapture = (program: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}) =>
  invoke<CaptureResult>('run_capture', { program, args, cwd: opts.cwd ?? null, env: opts.env ?? null });

export const startJob = (
  id: string,
  program: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
) => invoke<number>('start_job', { id, program, args, cwd: opts.cwd ?? null, env: opts.env ?? null });

export const stopJob = (id: string, graceful: boolean) => invoke<boolean>('stop_job', { id, graceful });

export const latestRelease = (repo: string) => invoke<Release>('latest_release', { repo });
/** `executable`: mark the file runnable (no-op on Windows). */
export const downloadFile = (id: string, url: string, dest: string, executable = false) =>
  invoke<void>('download_file', { id, url, dest, executable });
export const cancelDownload = (id: string) => invoke<void>('cancel_download', { id });

export interface JobOutputEvent {
  id: string;
  stream: 'stdout' | 'stderr';
  line: string;
}
export interface JobProgressEvent {
  id: string;
  title: string;
  current: number;
  total: number;
  eta: number;
}
export interface JobExitEvent {
  id: string;
  code: number | null;
  cancelled: boolean;
  error: string | null;
}
export interface DownloadProgressEvent {
  id: string;
  received: number;
  total: number | null;
}

export const onJobOutput = (f: (e: JobOutputEvent) => void): Promise<UnlistenFn> => listen<JobOutputEvent>('job-output', (e) => f(e.payload));
export const onJobProgress = (f: (e: JobProgressEvent) => void): Promise<UnlistenFn> => listen<JobProgressEvent>('job-progress', (e) => f(e.payload));
export const onJobExit = (f: (e: JobExitEvent) => void): Promise<UnlistenFn> => listen<JobExitEvent>('job-exit', (e) => f(e.payload));
export const onDownloadProgress = (f: (e: DownloadProgressEvent) => void): Promise<UnlistenFn> =>
  listen<DownloadProgressEvent>('download-progress', (e) => f(e.payload));

// ---------------------------------------------------------------------------
// Media info (`auto-editor info --json`)

export interface MediaInfo {
  type?: string;
  recommendedTimebase?: string;
  video: { codec: string; fps: string; resolution: [number, number]; duration: number; pix_fmt?: string; bitrate?: number; lang?: string }[];
  audio: { codec: string; layout: string; samplerate: number; duration: number; bitrate?: number; lang?: string }[];
  subtitle: { codec: string; lang?: string }[];
  container: { duration: number; bitrate?: number };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '–';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function formatFps(fps: string): string {
  if (!fps) return '';
  if (fps.includes('/')) {
    const [a, b] = fps.split('/').map(Number);
    if (b) return (a / b).toFixed(2).replace(/\.?0+$/, '');
  }
  return fps;
}

export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : JSON.stringify(e);
}

/** auto-editor prints "Error! <message>" on failure; pull out the message. */
export function aeError(stderr: string): string | null {
  const m = /Error!\s*([\s\S]*)/.exec(stderr);
  return m ? m[1].trim() : null;
}
