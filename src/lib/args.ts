// Building auto-editor command lines from EditSettings.

import { EXPORT_MAP } from './catalog';
import {
  DEFAULT_MARGIN,
  type EditSettings,
  type InputItem,
  dirName,
  extOf,
  joinPath,
  stemOf,
  str,
} from './model';
import { serializeChain, serializeEdit } from './serialize';

export interface BuildContext {
  /** Path of a yt-dlp the app manages, passed when the user hasn't set one. */
  ytdlpPath?: string;
}

/** Options that decide *what* gets cut: shared by renders and previews. */
export function editingArgs(s: EditSettings): string[] {
  const a: string[] = [];

  const edit = serializeEdit(s.edit);
  if (edit && edit !== 'audio') a.push('--edit', edit);

  const active = serializeChain(s.whenActive);
  if (active !== 'nil') a.push('--when-active', active);
  const inactive = serializeChain(s.whenInactive);
  if (inactive !== 'cut') a.push('--when-inactive', inactive);

  for (const l of s.labels) {
    const e = serializeEdit(l.edit);
    if (!e) continue;
    a.push(`--edit:${l.label}`, e);
    const act = serializeChain(l.actions);
    if (act !== 'nil') a.push(`--when:${l.label}`, act);
  }

  const before = str(s.marginBefore) || DEFAULT_MARGIN;
  const after = str(s.marginAfter) || DEFAULT_MARGIN;
  if (before !== DEFAULT_MARGIN || after !== DEFAULT_MARGIN) {
    a.push('--margin', before === after ? before : `${before},${after}`);
  }

  if (s.smooth.mode === 'off') a.push('--smooth', '0');
  else if (s.smooth.mode === 'custom') {
    const cut = str(s.smooth.minCut) || '0.2s';
    const clip = str(s.smooth.minClip);
    a.push('--smooth', clip ? `${cut},${clip}` : cut);
  }

  if (s.transition.enabled) {
    const dur = str(s.transition.duration) || '0.5s';
    const min = str(s.transition.minCut);
    a.push('--transition', min ? `dissolve:${dur}:${min}` : `dissolve:${dur}`);
  }

  // One flag per range: a second range after the same flag would be read as
  // an input file when it starts with '-'.
  const complete = (r: { start: string; stop: string }) => str(r.start) && str(r.stop);
  for (const r of s.cut.filter(complete)) a.push('--cut', `${str(r.start)},${str(r.stop)}`);
  for (const r of s.keep.filter(complete)) a.push('--keep', `${str(r.start)},${str(r.stop)}`);
  for (const r of s.setSpeed.filter(complete)) {
    if (str(r.speed)) a.push('--set-speed', `${str(r.speed)},${str(r.start)},${str(r.stop)}`);
  }
  for (const r of s.setAction.filter(complete)) {
    a.push('--set-action', `${serializeChain(r.actions)},${str(r.start)},${str(r.stop)}`);
  }

  if (str(s.frameRate)) a.push('--frame-rate', str(s.frameRate));
  if (str(s.sampleRate)) a.push('--sample-rate', str(s.sampleRate));
  if (str(s.resWidth) && str(s.resHeight)) a.push('--resolution', `${str(s.resWidth)},${str(s.resHeight)}`);
  if (str(s.background)) a.push('--background', str(s.background));

  return a;
}

export function exportValue(s: EditSettings): string | null {
  const def = EXPORT_MAP[s.exportKind];
  const attrs: string[] = [];
  if (def?.name && str(s.exportName)) {
    attrs.push(`name="${str(s.exportName).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  }
  if (def?.version && str(s.exportVersion)) attrs.push(`version=${str(s.exportVersion)}`);
  if (s.exportKind === 'default' && attrs.length === 0) return null;
  return attrs.length ? `${s.exportKind}:${attrs.join(',')}` : s.exportKind;
}

/** Everything that only matters when producing output. */
export function outputArgs(s: EditSettings, ctx: BuildContext = {}): string[] {
  const a: string[] = [];
  const exp = exportValue(s);
  if (exp) a.push('--export', exp);

  // A location typed into the extra auto-editor arguments wins.
  if (ctx.ytdlpPath && !splitArgs(s.extraArgs).includes('--yt-dlp-location')) a.push('--yt-dlp-location', ctx.ytdlpPath);
  if (str(s.ytdlpFormat)) a.push('--output-format', str(s.ytdlpFormat));
  if (str(s.ytdlpExtras)) a.push('--yt-dlp-extras', str(s.ytdlpExtras));

  if (s.debug) a.push('--debug');
  if (s.quiet) a.push('--quiet');

  if (s.vn) a.push('-vn');
  if (s.an) a.push('-an');
  if (s.sn) a.push('-sn');
  if (s.dn) a.push('-dn');
  if (s.faststart === 'on') a.push('--faststart');
  if (s.faststart === 'off') a.push('--no-faststart');
  if (s.fragmented === 'on') a.push('--fragmented');
  if (s.fragmented === 'off') a.push('--no-fragmented');

  const opt = (flag: string, v: string) => {
    if (str(v)) a.push(flag, str(v));
  };
  opt('--video-codec', s.videoCodec);
  opt('--video-bitrate', s.videoBitrate);
  opt('-crf', s.crf);
  opt('--gop', s.gop);
  opt('-vprofile', s.vprofile);
  opt('--preset', s.preset);
  opt('--pix-fmt', s.pixFmt);
  opt('--scale', s.scale);
  if (s.noSeek) a.push('--no-seek');
  if (s.noPartialLossless) a.push('--no-partial-lossless');

  opt('--audio-codec', s.audioCodec);
  opt('--audio-layout', s.audioLayout);
  opt('--audio-bitrate', s.audioBitrate);
  if (s.mixAudioStreams) a.push('--mix-audio-streams');
  const n = s.normalize;
  if (n.mode === 'peak') a.push('--audio-normalize', `peak:${str(n.peak) || '-3'}`);
  if (n.mode === 'ebu') {
    const kv = (['i', 'lra', 'tp', 'gain'] as const)
      .filter((k) => str(n[k]))
      .map((k) => `${k}=${str(n[k])}`);
    a.push('--audio-normalize', kv.length ? `ebu:${kv.join(',')}` : 'ebu');
  }

  if (s.noCache) a.push('--no-cache');
  if (s.openAfter) a.push('--open');
  return a;
}

/** Full argument list for one render job. */
export function renderArgs(
  s: EditSettings,
  inputs: string[],
  output: string | null,
  ctx: BuildContext = {},
): string[] {
  // yt-dlp only matters when something has to be downloaded.
  const hasUrl = inputs.some((i) => /^https?:\/\//i.test(i));
  const a = [...editingArgs(s), ...outputArgs(s, hasUrl ? ctx : { ...ctx, ytdlpPath: undefined }), ...splitArgs(s.extraArgs)];
  if (output) a.push('--output', output);
  // `--` ends the options, so inputs starting with '-' stay inputs.
  return [...a, '--', ...inputs];
}

/** Arguments for the cut preview: the timeline as v3 JSON on stdout. */
export function previewTimelineArgs(s: EditSettings, input: string): string[] {
  return [...editingArgs(s), '--export', 'v3', '--output', '-', '--', input];
}

export function previewStatsArgs(s: EditSettings, input: string): string[] {
  return [...editingArgs(s), '--preview', '--', input];
}

// ---------------------------------------------------------------------------
// Output naming

/** The `--output` for an input, or null to let auto-editor choose. URL inputs
 *  are named after the download, so they run in the output folder instead. */
export function outputPathFor(s: EditSettings, input: InputItem, fallbackDir: string, now = new Date()): string | null {
  const def = EXPORT_MAP[s.exportKind];
  const isMedia = s.exportKind === 'default' || s.exportKind === 'clip-sequence';
  if (input.kind === 'url') return null;

  let dir: string;
  let stem: string;
  let ext: string;
  if (input.kind === 'mic') {
    dir = s.outputDir || fallbackDir;
    stem = 'recording-' + timestamp(now);
    ext = isMedia ? s.container || 'wav' : def.ext ?? '';
  } else {
    dir = s.outputDir || dirName(input.value);
    stem = stemOf(input.value);
    ext = isMedia ? s.container || extOf(input.value) : def.ext ?? '';
  }
  return joinPath(dir, stem + s.outputSuffix + (ext ? '.' + ext : ''));
}

function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// Command-line text

/** Split a command-line fragment into arguments, honoring quotes. Backslashes
 *  are literal so Windows paths survive. */
export function splitArgs(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let started = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) {
        out.push(cur);
        cur = '';
        started = false;
      }
    } else {
      cur += ch;
      started = true;
    }
  }
  if (started) out.push(cur);
  return out;
}

/** Quote one argument for display (Windows command-line rules). */
export function quoteArg(arg: string): string {
  if (arg !== '' && /^[\w\-+=:.,/\\@%#~]+$/.test(arg)) return arg;
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
}

export function commandLine(program: string, args: string[]): string {
  return [program, ...args].map(quoteArg).join(' ');
}
