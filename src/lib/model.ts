// The editing settings the GUI builds a command line from. Everything here is
// plain JSON so it can be saved as a preset and restored as-is.

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export interface ActionStep {
  id: string;
  /** Action name from the catalog, or 'raw' for free text. */
  name: string;
  /** Values keyed by catalog param name. Empty string = use the default. */
  args: Record<string, string>;
  /** Easing for animatable actions: '' | linear | in | out | inout */
  ease?: string;
  easeDuration?: string;
  /** Free text when name === 'raw'. */
  raw?: string;
}

export type MethodKind = 'audio' | 'motion' | 'blackdetect' | 'subtitle' | 'word';

export interface MethodNode {
  id: string;
  kind: MethodKind;
  negate: boolean;
  params: Record<string, string>;
}

export interface EditSpec {
  /** builder: methods combined with `combine`; raw: free text;
   *  all: every moment is active ("1"); none: nothing is active ("0"). */
  mode: 'builder' | 'raw' | 'all' | 'none';
  combine: 'or' | 'and' | 'xor';
  methods: MethodNode[];
  raw: string;
}

export interface LabelClass {
  id: string;
  label: number;
  edit: EditSpec;
  actions: ActionStep[];
}

export interface TimeRange {
  id: string;
  start: string;
  stop: string;
}
export interface SpeedRange extends TimeRange {
  speed: string;
}
export interface ActionRange extends TimeRange {
  actions: ActionStep[];
}

export type Tri = 'default' | 'on' | 'off';

export type ExportKind =
  | 'default'
  | 'premiere'
  | 'premiere-otio'
  | 'resolve'
  | 'resolve-fcp7'
  | 'final-cut-pro'
  | 'shotcut'
  | 'kdenlive'
  | 'clip-sequence'
  | 'v3'
  | 'v2'
  | 'v1';

export interface EditSettings {
  edit: EditSpec;
  whenActive: ActionStep[];
  whenInactive: ActionStep[];
  labels: LabelClass[];

  /** Lengths like "0.2s" or "6" (frames). */
  marginBefore: string;
  marginAfter: string;
  smooth: { mode: 'default' | 'off' | 'custom'; minCut: string; minClip: string };
  transition: { enabled: boolean; duration: string; minCut: string };

  cut: TimeRange[];
  keep: TimeRange[];
  setSpeed: SpeedRange[];
  setAction: ActionRange[];

  exportKind: ExportKind;
  exportName: string;
  exportVersion: string;
  /** Output container extension without dot ('' = same as input). */
  container: string;
  /** '' = next to the input file. */
  outputDir: string;
  outputSuffix: string;

  frameRate: string;
  sampleRate: string;
  resWidth: string;
  resHeight: string;
  background: string;

  ytdlpFormat: string;
  ytdlpExtras: string;

  debug: boolean;
  quiet: boolean;

  vn: boolean;
  an: boolean;
  sn: boolean;
  dn: boolean;
  faststart: Tri;
  fragmented: Tri;

  videoCodec: string;
  videoBitrate: string;
  crf: string;
  gop: string;
  vprofile: string;
  preset: string;
  pixFmt: string;
  scale: string;
  noSeek: boolean;
  noPartialLossless: boolean;

  audioCodec: string;
  audioLayout: string;
  audioBitrate: string;
  mixAudioStreams: boolean;
  normalize: { mode: 'off' | 'ebu' | 'peak'; i: string; lra: string; tp: string; gain: string; peak: string };

  noCache: boolean;
  openAfter: boolean;
  /** Anything else, typed as on a command line. */
  extraArgs: string;
}

export const DEFAULT_MARGIN = '0.2s';

/** Settings come from text and number inputs (and old JSON), so treat every
 *  value as possibly a number, null or undefined. */
export function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

export function step(name: string, args: Record<string, string> = {}): ActionStep {
  return { id: uid('a'), name, args };
}

export function method(kind: MethodKind, params: Record<string, string> = {}, negate = false): MethodNode {
  return { id: uid('m'), kind, negate, params };
}

export function defaultEdit(): EditSpec {
  return { mode: 'builder', combine: 'or', methods: [method('audio')], raw: '' };
}

export function defaultSettings(): EditSettings {
  return {
    edit: defaultEdit(),
    whenActive: [step('nil')],
    whenInactive: [step('cut')],
    labels: [],
    marginBefore: DEFAULT_MARGIN,
    marginAfter: DEFAULT_MARGIN,
    smooth: { mode: 'default', minCut: '0.2s', minClip: '0.1s' },
    transition: { enabled: false, duration: '0.5s', minCut: '1s' },
    cut: [],
    keep: [],
    setSpeed: [],
    setAction: [],
    exportKind: 'default',
    exportName: '',
    exportVersion: '',
    container: '',
    outputDir: '',
    outputSuffix: '_ALTERED',
    frameRate: '',
    sampleRate: '',
    resWidth: '',
    resHeight: '',
    background: '',
    ytdlpFormat: '',
    ytdlpExtras: '',
    debug: false,
    quiet: false,
    vn: false,
    an: false,
    sn: false,
    dn: false,
    faststart: 'default',
    fragmented: 'default',
    videoCodec: '',
    videoBitrate: '',
    crf: '',
    gop: '',
    vprofile: '',
    preset: '',
    pixFmt: '',
    scale: '',
    noSeek: false,
    noPartialLossless: false,
    audioCodec: '',
    audioLayout: '',
    audioBitrate: '',
    mixAudioStreams: false,
    normalize: { mode: 'off', i: '', lra: '', tp: '', gain: '', peak: '-3' },
    noCache: false,
    openAfter: false,
    extraArgs: '',
  };
}

/** Fill in fields missing from older presets/settings files. */
export function normalizeSettings(partial: Partial<EditSettings> | undefined | null): EditSettings {
  const base = defaultSettings();
  if (!partial || typeof partial !== 'object') return base;
  const merged = { ...base, ...partial } as EditSettings;
  merged.smooth = { ...base.smooth, ...(partial.smooth ?? {}) };
  merged.transition = { ...base.transition, ...(partial.transition ?? {}) };
  merged.normalize = { ...base.normalize, ...(partial.normalize ?? {}) };
  merged.edit = { ...base.edit, ...(partial.edit ?? {}) };
  return merged;
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Inputs

export type InputKind = 'file' | 'url' | 'mic';

export interface InputItem {
  id: string;
  kind: InputKind;
  /** File path, URL, or ':mic'. */
  value: string;
}

export function inputLabel(item: InputItem): string {
  if (item.kind === 'mic') return 'Microphone recording';
  if (item.kind === 'url') return item.value;
  return baseName(item.value);
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function dirName(path: string): string {
  const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (idx < 0) return '';
  if (idx === 0) return path[0]; // "/file"
  const dir = path.slice(0, idx);
  // Keep the root separator: a bare "C:" means "current folder on drive C".
  return /^[A-Za-z]:$/.test(dir) ? dir + path[idx] : dir;
}

export function stemOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function extOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function joinPath(dir: string, name: string): string {
  if (!dir) return name;
  const sep = dir.includes('\\') || !dir.includes('/') ? '\\' : '/';
  return dir.endsWith('\\') || dir.endsWith('/') ? dir + name : dir + sep + name;
}
