// App-wide state: preferences, current settings, inputs, tools and presets.
// Persisted as JSON in the portable data folder.

import { videoDir } from '@tauri-apps/api/path';

import * as backend from './backend';
import type { AppInfo, MediaInfo, ToolInfo } from './backend';
import { TIMELINE_EXTENSIONS } from './catalog';
import { BUILTIN_PRESETS, type Preset } from './presets';
import {
  clone,
  defaultSettings,
  extOf,
  joinPath,
  normalizeSettings,
  uid,
  type EditSettings,
  type InputItem,
} from './model';

export type Theme = 'system' | 'light' | 'dark';
export type Tab = 'edit' | 'transcribe' | 'tools' | 'settings';

export interface Prefs {
  autoEditorPath: string;
  ytdlpPath: string;
  licenseKey: string;
  theme: Theme;
  /** separate: one job per input; combine: all inputs into one timeline. */
  batchMode: 'separate' | 'combine';
  /** Where recordings and downloads go when no output folder is set. */
  defaultOutputDir: string;
  autoPreview: boolean;
  lastPresetId: string;
}

export interface WhisperForm {
  source: 'file' | 'mic';
  file: string;
  model: string;
  language: string;
  format: 'srt' | 'text' | 'json';
  destination: 'sidecar' | 'custom' | 'screen';
  customOutput: string;
  translate: boolean;
  splitWords: boolean;
  prompt: string;
  threads: string;
  queue: string;
  threshold: string;
  debug: boolean;
}

function defaultPrefs(): Prefs {
  return {
    autoEditorPath: '',
    ytdlpPath: '',
    licenseKey: '',
    theme: 'system',
    batchMode: 'separate',
    defaultOutputDir: '',
    autoPreview: true,
    lastPresetId: 'default',
  };
}

function defaultWhisper(): WhisperForm {
  return {
    source: 'file',
    file: '',
    model: '',
    language: 'auto',
    format: 'srt',
    destination: 'sidecar',
    customOutput: '',
    translate: false,
    splitWords: false,
    prompt: '',
    threads: '',
    queue: '',
    threshold: '',
    debug: false,
  };
}

interface SavedFile {
  version: 1;
  prefs: Prefs;
  settings: EditSettings;
  whisper: WhisperForm;
  presets: Preset[];
}

class AppState {
  info = $state<AppInfo | null>(null);
  tab = $state<Tab>('edit');
  prefs = $state<Prefs>(defaultPrefs());
  settings = $state<EditSettings>(defaultSettings());
  whisper = $state<WhisperForm>(defaultWhisper());
  userPresets = $state<Preset[]>([]);

  inputs = $state<InputItem[]>([]);
  /** File shown in the cut preview (kept across tab switches). */
  previewFile = $state('');
  /** Media info by file path (undefined = not loaded, null = failed). */
  mediaInfo = $state<Record<string, MediaInfo | null>>({});

  videosDir = $state('');

  autoEditor = $state<ToolInfo | null>(null);
  ytdlp = $state<ToolInfo | null>(null);
  toolsChecked = $state(false);

  toast = $state<{ id: number; text: string; kind: 'info' | 'error' | 'success' } | null>(null);

  loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private unsaved: SavedFile | null = null;
  /** In-flight `auto-editor info` calls, by path, and a cap on how many run
   *  at once (adding a folder of 100 files shouldn't start 100 processes). */
  private infoLoads = new Map<string, Promise<MediaInfo | null>>();
  private infoRunning = 0;
  private infoWaiting: (() => void)[] = [];

  get settingsPath(): string {
    return this.info ? joinPath(this.info.paths.data, 'settings.json') : '';
  }

  get presets(): Preset[] {
    return [...BUILTIN_PRESETS, ...this.userPresets];
  }

  /** License key passed through the environment so it never shows up in
   *  the command line or process list. */
  get env(): Record<string, string> | undefined {
    const key = this.prefs.licenseKey.trim();
    return key ? { AE_PRIVATE_LK: key } : undefined;
  }

  async load() {
    this.info = await backend.appInfo();
    this.videosDir = await videoDir().catch(() => '');
    let text: string | null = null;
    try {
      text = await backend.readText(this.settingsPath);
      if (text) {
        const saved = JSON.parse(text) as Partial<SavedFile>;
        this.prefs = { ...defaultPrefs(), ...(saved.prefs ?? {}) };
        this.settings = normalizeSettings(saved.settings);
        this.whisper = { ...defaultWhisper(), ...(saved.whisper ?? {}) };
        this.userPresets = (saved.presets ?? []).map((p) => ({ ...p, builtin: false, settings: normalizeSettings(p.settings) }));
      }
    } catch (e) {
      // The next save overwrites settings.json, so keep a copy of the
      // unreadable one; the user's presets may be recoverable from it.
      let kept = '';
      if (text) {
        const copy = joinPath(this.info.paths.data, `settings.broken-${Date.now()}.json`);
        kept = await backend.writeText(copy, text).then(() => `; the old file was kept as ${copy}`, () => '');
      }
      this.notify(`Settings file couldn't be read, starting fresh (${backend.errorText(e)})${kept}`, 'error');
    }
    this.loaded = true;
    await this.refreshTools();
    if (this.info.launchFiles.length) this.addFiles(this.info.launchFiles);
  }

  /** Debounced save; called from an $effect watching the persisted state. */
  scheduleSave() {
    if (!this.loaded) return;
    this.unsaved = {
      version: 1,
      prefs: clone(this.prefs),
      settings: clone(this.settings),
      whisper: clone(this.whisper),
      presets: clone(this.userPresets),
    };
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flushSave(), 400);
  }

  /** Write a pending save now (also used when the window closes). */
  async flushSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const snapshot = this.unsaved;
    if (!snapshot) return;
    this.unsaved = null;
    try {
      await backend.writeText(this.settingsPath, JSON.stringify(snapshot, null, 2));
    } catch (e) {
      this.notify(`Couldn't save settings: ${backend.errorText(e)}`, 'error');
    }
  }

  async refreshTools() {
    const [ae, yt] = await Promise.all([
      backend.locateTool('auto-editor', this.prefs.autoEditorPath).catch(() => null),
      backend.locateTool('yt-dlp', this.prefs.ytdlpPath).catch(() => null),
    ]);
    this.autoEditor = ae;
    this.ytdlp = yt;
    this.toolsChecked = true;
    // Files added before auto-editor was set up still need their info.
    if (ae) for (const i of this.inputs) if (i.kind === 'file') void this.loadInfo(i.value);
  }

  notify(text: string, kind: 'info' | 'error' | 'success' = 'info') {
    const id = Date.now();
    this.toast = { id, text, kind };
    setTimeout(() => {
      if (this.toast?.id === id) this.toast = null;
    }, kind === 'error' ? 8000 : 4000);
  }

  // --- Inputs ---------------------------------------------------------------

  addFiles(paths: string[]) {
    const existing = new Set(this.inputs.map((i) => i.value));
    for (const p of paths) {
      if (existing.has(p)) continue;
      this.inputs.push({ id: uid('in'), kind: 'file', value: p });
      void this.loadInfo(p);
    }
  }

  addUrl(url: string) {
    this.inputs.push({ id: uid('in'), kind: 'url', value: url.trim() });
  }

  addMic() {
    if (!this.inputs.some((i) => i.kind === 'mic')) this.inputs.push({ id: uid('in'), kind: 'mic', value: ':mic' });
  }

  removeInput(id: string) {
    this.inputs = this.inputs.filter((i) => i.id !== id);
  }

  loadInfo(path: string, force = false): Promise<MediaInfo | null> {
    if (!force && path in this.mediaInfo) return Promise.resolve(this.mediaInfo[path]);
    const inflight = this.infoLoads.get(path);
    if (inflight) return inflight;
    // Timelines aren't media; the input list describes them without info.
    if (!this.autoEditor || TIMELINE_EXTENSIONS.includes(extOf(path))) return Promise.resolve(null);
    const ae = this.autoEditor.path;
    delete this.mediaInfo[path]; // back to "Reading…" on a retry
    const load = this.withInfoSlot(async () => {
      try {
        const r = await backend.runCapture(ae, ['info', '--json', path]);
        const parsed = JSON.parse(r.stdout) as Record<string, MediaInfo>;
        return parsed[path] ?? Object.values(parsed)[0] ?? null;
      } catch {
        return null;
      }
    }).then((info) => {
      this.mediaInfo[path] = info;
      this.infoLoads.delete(path);
      return info;
    });
    this.infoLoads.set(path, load);
    return load;
  }

  private async withInfoSlot<T>(f: () => Promise<T>): Promise<T> {
    while (this.infoRunning >= 3) await new Promise<void>((resolve) => this.infoWaiting.push(resolve));
    this.infoRunning++;
    try {
      return await f();
    } finally {
      this.infoRunning--;
      this.infoWaiting.shift()?.();
    }
  }

  // --- Presets --------------------------------------------------------------

  applyPreset(id: string) {
    const preset = this.presets.find((p) => p.id === id);
    if (!preset) return;
    // Keep where files go; presets are about how they're edited.
    const { outputDir, outputSuffix } = this.settings;
    this.settings = { ...clone(preset.settings), outputDir, outputSuffix };
    this.prefs.lastPresetId = id;
  }

  savePreset(name: string, description = ''): Preset {
    const existing = this.userPresets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.settings = clone(this.settings);
      existing.description = description || existing.description;
      this.prefs.lastPresetId = existing.id;
      return existing;
    }
    const preset: Preset = { id: uid('preset'), name, description, settings: clone(this.settings) };
    this.userPresets.push(preset);
    this.prefs.lastPresetId = preset.id;
    return preset;
  }

  deletePreset(id: string) {
    this.userPresets = this.userPresets.filter((p) => p.id !== id);
    if (this.prefs.lastPresetId === id) this.prefs.lastPresetId = 'default';
  }
}

export const app = new AppState();
