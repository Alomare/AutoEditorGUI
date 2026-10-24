// Installing and updating auto-editor, yt-dlp and Whisper models.

import * as backend from './backend';
import { joinPath } from './model';
import { app } from './state.svelte';

export interface DownloadState {
  label: string;
  received: number;
  total: number | null;
}

class Downloads {
  active = $state<Record<string, DownloadState>>({});
  /** Last failure per download id, shown next to the item until retried. */
  errors = $state<Record<string, string>>({});
  private listening = false;

  async init() {
    if (this.listening) return;
    this.listening = true;
    await backend.onDownloadProgress((e) => {
      const d = this.active[e.id];
      if (d) {
        d.received = e.received;
        d.total = e.total;
      }
    });
  }

  async run(id: string, label: string, url: string, dest: string, executable = false) {
    if (this.active[id]) throw new Error('This download is already in progress');
    this.active[id] = { label, received: 0, total: null };
    delete this.errors[id];
    try {
      await backend.downloadFile(id, url, dest, executable);
    } catch (e) {
      this.errors[id] = backend.errorText(e);
      throw e;
    } finally {
      delete this.active[id];
    }
  }

  cancel(id: string) {
    void backend.cancelDownload(id);
  }
}

export const downloads = new Downloads();

const exe = (name: string) => (app.info?.os === 'windows' ? `${name}.exe` : name);

export function autoEditorAsset(os: string, arch: string): string {
  if (os === 'windows') return `auto-editor-windows-${arch === 'aarch64' ? 'aarch64' : 'x86_64'}.exe`;
  if (os === 'macos') return `auto-editor-macos-${arch === 'aarch64' ? 'arm64' : 'x86_64'}`;
  return `auto-editor-linux-${arch === 'arm' ? 'armv7' : arch}`;
}

export function ytdlpAsset(os: string, arch: string): string {
  if (os === 'windows') return arch === 'aarch64' ? 'yt-dlp_arm64.exe' : 'yt-dlp.exe';
  if (os === 'macos') return 'yt-dlp_macos';
  return arch === 'aarch64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
}

export interface UpdateInfo {
  latest: string;
  url: string;
  size: number;
  newer: boolean;
}

function versionKey(v: string): number[] {
  return (v.match(/\d+/g) ?? []).map(Number);
}

export function isNewer(latest: string, current: string | null | undefined): boolean {
  if (!current) return true;
  const a = versionKey(latest);
  const b = versionKey(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export async function checkUpdate(tool: 'auto-editor' | 'yt-dlp'): Promise<UpdateInfo> {
  const info = app.info!;
  const repo = tool === 'auto-editor' ? 'WyattBlue/auto-editor' : 'yt-dlp/yt-dlp';
  const assetName = tool === 'auto-editor' ? autoEditorAsset(info.os, info.arch) : ytdlpAsset(info.os, info.arch);
  const rel = await backend.latestRelease(repo);
  const asset = rel.assets.find((a) => a.name === assetName);
  if (!asset) throw new Error(`No ${assetName} in the latest ${tool} release`);
  const current = tool === 'auto-editor' ? app.autoEditor?.version : app.ytdlp?.version;
  return { latest: rel.tag_name, url: asset.browser_download_url, size: asset.size, newer: isNewer(rel.tag_name, current) };
}

/** Download a tool into the app's bin folder and start using it. */
export async function installTool(tool: 'auto-editor' | 'yt-dlp', update?: UpdateInfo) {
  const u = update ?? (await checkUpdate(tool));
  const dest = joinPath(app.info!.paths.bin, exe(tool));
  await downloads.run(tool, `${tool} ${u.latest}`, u.url, dest, true);
  if (tool === 'auto-editor') app.prefs.autoEditorPath = '';
  else app.prefs.ytdlpPath = '';
  await app.refreshTools();
}
