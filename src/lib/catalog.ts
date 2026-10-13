// What auto-editor 31.7 understands, described for the UI: actions, edit
// methods, export targets and common values. Taken from auto-editor's own
// definitions (src/action.nim, src/editmethods.nim, src/conductor.nim).

import type { ExportKind, MethodKind } from './model';

// ---------------------------------------------------------------------------
// Actions

export type ParamKind =
  | 'number' // a plain number
  | 'ramp' // a number or keyframes like 1..1.5..1
  | 'text'
  | 'select'
  | 'color'
  | 'file'
  | 'flag' // emits a keyword when checked
  | 'time'; // a length like 2sec or 30 (frames)

export interface ParamDef {
  name: string;
  label: string;
  kind: ParamKind;
  /** Used when a later param is set but this one is left empty. */
  default?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Prefix written before the value, e.g. "seed=". */
  prefix?: string;
  /** Keyword written for a checked flag. */
  flag?: string;
  /** Only show this param when the predicate holds (add's sources). */
  showIf?: (args: Record<string, string>) => boolean;
  help?: string;
}

export type ActionGroup = 'Basic' | 'Speed & pitch' | 'Audio' | 'Picture' | 'Geometry' | 'Keying & masks' | 'Overlays' | 'Animation';

export interface ActionDef {
  name: string;
  label: string;
  group: ActionGroup;
  media: 'A' | 'V' | 'AV';
  animatable?: boolean;
  /** Leading params that must always be written (filled from defaults). */
  minArgs?: number;
  /** Joins the args with this instead of ':' (spin uses deg/rate). */
  argJoin?: string;
  license?: boolean;
  params: ParamDef[];
  help: string;
}

const EASE_CURVES = [
  { value: 'linear', label: 'Linear' },
  { value: 'in', label: 'Ease in' },
  { value: 'out', label: 'Ease out' },
  { value: 'inout', label: 'Ease in-out' },
];
export { EASE_CURVES };

const RAMP_HELP = 'A value, or keyframes like 1..1.5 or 1..2..1, animated evenly across the section.';

const isSrc = (kind: string) => (a: Record<string, string>) => (a.source || 'file') === kind;

export const ACTIONS: ActionDef[] = [
  { name: 'nil', label: 'Keep (no change)', group: 'Basic', media: 'AV', params: [],
    help: 'Keep the section unchanged at normal speed and pitch.' },
  { name: 'cut', label: 'Cut (remove)', group: 'Basic', media: 'AV', params: [],
    help: 'Remove the section completely from the output.' },

  { name: 'speed', minArgs: 1, label: 'Speed (keep pitch)', group: 'Speed & pitch', media: 'AV',
    params: [{ name: 'value', label: 'Speed ×', kind: 'number', default: '2', placeholder: '2' }],
    help: 'Change playback speed while preserving pitch. 2 = twice as fast, 0.5 = half speed.' },
  { name: 'varispeed', minArgs: 1, label: 'Varispeed (tape-style)', group: 'Speed & pitch', media: 'AV',
    params: [{ name: 'value', label: 'Speed ×', kind: 'number', default: '1.5', placeholder: '1.5' }],
    help: 'Change speed by resampling, so pitch shifts with it like tape or vinyl. Range 0.2–100.' },
  { name: 'pitch', minArgs: 1, label: 'Pitch shift', group: 'Speed & pitch', media: 'A',
    params: [{ name: 'semitones', label: 'Semitones', kind: 'number', default: '12', placeholder: '12' }],
    help: 'Shift pitch without changing speed. 12 = one octave up, -12 = one octave down (range -24–24).' },

  { name: 'volume', minArgs: 1, label: 'Volume', group: 'Audio', media: 'A', animatable: true,
    params: [{ name: 'value', label: 'Volume', kind: 'ramp', default: '0.5', placeholder: '0.5 or 0..1', help: RAMP_HELP }],
    help: 'Scale volume. 1 = unchanged, 0.5 = half (-6 dB), 2 = double (+6 dB).' },
  { name: 'deesser', minArgs: 1, label: 'De-esser', group: 'Audio', media: 'A',
    params: [
      { name: 'intensity', label: 'Intensity', kind: 'number', default: '0.5', placeholder: '0–1' },
      { name: 'max', label: 'Max reduction', kind: 'number', default: '0.5', placeholder: '0–1' },
      { name: 'freq', label: 'Split frequency', kind: 'number', default: '0.5', placeholder: '0–1' },
    ],
    help: 'Reduce harsh "s" and "sh" sibilance.' },
  { name: 'duck', label: 'Auto-duck', group: 'Audio', media: 'A',
    params: [
      { name: 'amount', label: 'Amount', kind: 'number', default: '0.85', placeholder: '0.85' },
      { name: 'threshold', label: 'Threshold', kind: 'number', default: '0.04', placeholder: '0.04' },
      { name: 'attack', label: 'Attack (ms)', kind: 'number', default: '100', placeholder: '100' },
      { name: 'release', label: 'Release (ms)', kind: 'number', default: '500', placeholder: '500' },
    ],
    help: 'Lower this audio wherever the louder audio layers beneath it are active (e.g. tuck music under a voice).' },

  { name: 'invert', label: 'Invert colors', group: 'Picture', media: 'V', params: [], help: 'Photo-negative.' },
  { name: 'hflip', label: 'Flip horizontally', group: 'Picture', media: 'V', params: [], help: 'Mirror left to right.' },
  { name: 'vflip', label: 'Flip vertically', group: 'Picture', media: 'V', params: [], help: 'Mirror top to bottom.' },
  { name: 'erosion', label: 'Erosion', group: 'Picture', media: 'V', params: [], help: 'Gritty, eaten-away look.' },
  { name: 'opacity', minArgs: 1, label: 'Opacity', group: 'Picture', media: 'V', animatable: true,
    params: [{ name: 'value', label: 'Opacity', kind: 'ramp', default: '1', placeholder: '0..1', help: RAMP_HELP }],
    help: 'Blend against the background. 1 = opaque, 0 = transparent. Use 0..1 to fade in.' },
  { name: 'blur', minArgs: 1, label: 'Blur', group: 'Picture', media: 'V', animatable: true,
    params: [{ name: 'value', label: 'Sigma', kind: 'ramp', default: '5', placeholder: '5', help: RAMP_HELP }],
    help: 'Gaussian blur. 0 = none; larger blurs more.' },
  { name: 'brightness', minArgs: 1, label: 'Brightness', group: 'Picture', media: 'V', animatable: true,
    params: [{ name: 'value', label: 'Offset', kind: 'ramp', default: '0.1', placeholder: '-1 to 1', help: RAMP_HELP }],
    help: 'Add an equal offset to R, G and B. Positive brightens, negative darkens.' },
  { name: 'brighthue', minArgs: 1, label: 'Luma shift', group: 'Picture', media: 'V',
    params: [{ name: 'value', label: 'Offset', kind: 'number', default: '0.1', placeholder: '-1 to 1' }],
    help: 'Shift luma (Y channel).' },
  { name: 'contrast', minArgs: 1, label: 'Contrast', group: 'Picture', media: 'V',
    params: [{ name: 'value', label: 'Contrast', kind: 'number', default: '1.2', placeholder: '1 = unchanged' }],
    help: 'Scale contrast around mid-gray. 1 = unchanged (range -2–2).' },
  { name: 'saturation', minArgs: 1, label: 'Saturation', group: 'Picture', media: 'V',
    params: [{ name: 'value', label: 'Saturation', kind: 'number', default: '1.2', placeholder: '0 = gray' }],
    help: 'Scale saturation. 0 = grayscale, 1 = unchanged (max 3).' },
  { name: 'pixelate', label: 'Pixelate', group: 'Picture', media: 'V', animatable: true,
    params: [
      { name: 'w', label: 'Block width', kind: 'ramp', default: '16', placeholder: '16 or 1..48', help: RAMP_HELP },
      { name: 'h', label: 'Block height', kind: 'ramp', placeholder: 'same as width' },
    ],
    help: 'Coarse mosaic, the classic censoring look. Pair with "Confine to region".' },
  { name: 'aberration', label: 'Chromatic aberration', group: 'Picture', media: 'V',
    params: [
      { name: 'h', label: 'Horizontal px', kind: 'number', default: '5', placeholder: '5' },
      { name: 'v', label: 'Vertical px', kind: 'number', default: '0', placeholder: '0' },
      { name: 'edge', label: 'Edge', kind: 'select', default: 'smear', options: [{ value: 'smear', label: 'Smear' }, { value: 'wrap', label: 'Wrap' }] },
    ],
    help: 'Shift color channels apart for a cheap-lens / glitch look.' },
  { name: 'lens', label: 'Lens distortion', group: 'Picture', media: 'V',
    params: [
      { name: 'k1', label: 'k1', kind: 'number', default: '0', placeholder: 'fisheye if empty' },
      { name: 'k2', label: 'k2', kind: 'number', default: '0' },
    ],
    help: 'Negative values bulge outward (fisheye), positive pinch inward. Empty = fun fisheye.' },

  { name: 'zoom', minArgs: 1, label: 'Zoom', group: 'Geometry', media: 'V', animatable: true,
    params: [{ name: 'value', label: 'Zoom', kind: 'ramp', default: '1.5', placeholder: '1.5 or 1..1.5', help: RAMP_HELP }],
    help: 'Scale about the center. 1 = none, 2 = 2× in. Use 1..1.5 for a Ken Burns effect.' },
  { name: 'rotate', minArgs: 1, label: 'Rotate', group: 'Geometry', media: 'V',
    params: [{ name: 'deg', label: 'Degrees', kind: 'number', default: '90', placeholder: '90' }],
    help: 'Fixed clockwise rotation; the frame grows so nothing is clipped. Pair with a timeline resolution for portrait.' },
  { name: 'spin', label: 'Spin', group: 'Geometry', media: 'V', argJoin: '/',
    params: [
      { name: 'deg', label: 'Start degrees', kind: 'number', default: '0', placeholder: '0' },
      { name: 'rate', label: 'Degrees / second', kind: 'number', default: '120', placeholder: '120' },
    ],
    help: 'Continuous spin. Negative rate = counter-clockwise.' },
  { name: 'pos', minArgs: 2, label: 'Position (overlay)', group: 'Geometry', media: 'V', animatable: true,
    params: [
      { name: 'x', label: 'X', kind: 'ramp', default: '0', placeholder: '0 or 0..600' },
      { name: 'y', label: 'Y', kind: 'ramp', default: '0', placeholder: '0' },
      { name: 'scale', label: 'Scale', kind: 'ramp', placeholder: '1' },
    ],
    help: 'Place this clip as an overlay (top-left corner in canvas pixels). No effect on the base track.' },

  { name: 'drawbox', minArgs: 5, label: 'Draw box', group: 'Keying & masks', media: 'V',
    params: [
      { name: 'x', label: 'X', kind: 'number', default: '0' },
      { name: 'y', label: 'Y', kind: 'number', default: '0' },
      { name: 'w', label: 'Width', kind: 'number', default: '400' },
      { name: 'h', label: 'Height', kind: 'number', default: '200' },
      { name: 'color', label: 'Color', kind: 'color', default: '#000000' },
    ],
    help: 'Filled rectangle, e.g. to redact part of the frame.' },
  { name: 'confine', label: 'Confine to region', group: 'Keying & masks', media: 'V',
    params: [
      { name: 'x', label: 'X', kind: 'number', default: '0' },
      { name: 'y', label: 'Y', kind: 'number', default: '0' },
      { name: 'w', label: 'Width', kind: 'number', default: '200' },
      { name: 'h', label: 'Height', kind: 'number', default: '200' },
      { name: 'radius', label: 'Corner radius', kind: 'number', default: '0', placeholder: '-1 = ellipse' },
      { name: 'feather', label: 'Feather', kind: 'number', default: '0' },
      { name: 'invert', label: 'Invert', kind: 'flag', flag: 'invert' },
    ],
    help: 'Restrict the effects after it (blur, pixelate, brightness...) to a region. Empty = reset to full frame.' },
  { name: 'mask', minArgs: 4, label: 'Mask (shape)', group: 'Keying & masks', media: 'V',
    params: [
      { name: 'x', label: 'X', kind: 'number', default: '0' },
      { name: 'y', label: 'Y', kind: 'number', default: '0' },
      { name: 'w', label: 'Width', kind: 'number', default: '300' },
      { name: 'h', label: 'Height', kind: 'number', default: '300' },
      { name: 'radius', label: 'Corner radius', kind: 'number', default: '0', placeholder: '-1 = ellipse' },
      { name: 'feather', label: 'Feather', kind: 'number', default: '0' },
      { name: 'invert', label: 'Invert', kind: 'flag', flag: 'invert' },
    ],
    help: 'Cut the picture to a rounded rectangle or ellipse. Great for circular picture-in-picture.' },
  { name: 'colorkey', minArgs: 1, label: 'Color key', group: 'Keying & masks', media: 'V',
    params: [
      { name: 'color', label: 'Key color', kind: 'color', default: '#00ff00' },
      { name: 'similar', label: 'Similarity', kind: 'number', default: '0.25' },
      { name: 'blend', label: 'Blend', kind: 'number', default: '0.0' },
    ],
    help: 'Make a flat color transparent (logos, screen recordings).' },
  { name: 'chromakey', minArgs: 1, label: 'Chroma key (green screen)', group: 'Keying & masks', media: 'V',
    params: [
      { name: 'color', label: 'Key color', kind: 'color', default: '#00ff00' },
      { name: 'similar', label: 'Similarity', kind: 'number', default: '0.25' },
      { name: 'blend', label: 'Blend', kind: 'number', default: '0.0' },
    ],
    help: 'Green/blue-screen keyer for real camera footage.' },
  { name: 'choke', label: 'Choke matte', group: 'Keying & masks', media: 'V',
    params: [{ name: 'n', label: 'Pixels', kind: 'number', default: '1', placeholder: '1–16' }],
    help: 'Shrink the alpha left by a key to remove spill. Put it after the key.' },

  { name: 'add', label: 'Add overlay / layer', group: 'Overlays', media: 'AV', license: true,
    params: [
      { name: 'source', label: 'Layer', kind: 'select', default: 'file', options: [
        { value: 'file', label: 'File (image, video, audio)' },
        { value: 'tone', label: 'Tone (generated audio)' },
        { value: 'confetti', label: 'Confetti' },
        { value: 'drawbox', label: 'Box' },
      ] },
      { name: 'path', label: 'File', kind: 'file', showIf: isSrc('file') },
      { name: 'note', label: 'MIDI note', kind: 'number', default: '69', placeholder: '69 = A440', showIf: isSrc('tone') },
      { name: 'wave', label: 'Waveform', kind: 'select', options: [
        { value: '', label: 'Sine' }, { value: 'saw', label: 'Saw' }, { value: 'square', label: 'Square' }, { value: 'triangle', label: 'Triangle' },
      ], showIf: isSrc('tone') },
      { name: 'count', label: 'Count', kind: 'number', placeholder: '200', showIf: isSrc('confetti') },
      { name: 'gravity', label: 'Gravity', kind: 'number', placeholder: '1.4', showIf: isSrc('confetti') },
      { name: 'scheme', label: 'Colors', kind: 'select', options: [
        { value: '', label: 'Party' }, { value: 'neon', label: 'Neon' }, { value: 'gold', label: 'Gold' }, { value: 'duotone', label: 'Duotone' }, { value: 'white', label: 'White' },
      ], showIf: isSrc('confetti') },
      { name: 'origin', label: 'Origin', kind: 'select', options: [
        { value: '', label: 'Sides' }, { value: 'bottom', label: 'Bottom' }, { value: 'top', label: 'Top' }, { value: 'center', label: 'Center' },
      ], showIf: isSrc('confetti') },
      { name: 'bx', label: 'Box X', kind: 'number', default: '0', showIf: isSrc('drawbox') },
      { name: 'by', label: 'Box Y', kind: 'number', default: '0', showIf: isSrc('drawbox') },
      { name: 'bw', label: 'Box width', kind: 'number', default: '400', showIf: isSrc('drawbox') },
      { name: 'bh', label: 'Box height', kind: 'number', default: '200', showIf: isSrc('drawbox') },
      { name: 'bcolor', label: 'Box color', kind: 'color', default: '#ff0000', showIf: isSrc('drawbox') },
      { name: 'x', label: 'Place at X', kind: 'ramp', placeholder: 'centered', showIf: (a) => (a.source || 'file') !== 'tone' },
      { name: 'y', label: 'Place at Y', kind: 'ramp', placeholder: 'centered', showIf: (a) => (a.source || 'file') !== 'tone' },
      { name: 'scale', label: 'Scale', kind: 'ramp', placeholder: 'fit', showIf: (a) => (a.source || 'file') !== 'tone' },
      { name: 'followBase', label: 'Follow base speed', kind: 'select', options: [
        { value: '', label: 'Default' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' },
      ] },
    ],
    help: 'Overlay a layer: a logo, picture-in-picture video, background music, a tone, confetti or a box. Actions after it in the chain apply to the new layer. Requires a license key.' },
  { name: 'confetti', label: 'Confetti', group: 'Overlays', media: 'V',
    params: [
      { name: 'count', label: 'Count', kind: 'number', default: '200', placeholder: '200' },
      { name: 'gravity', label: 'Gravity', kind: 'number', default: '1.4', placeholder: '1.4' },
      { name: 'scheme', label: 'Colors', kind: 'select', default: 'party', options: [
        { value: 'party', label: 'Party' }, { value: 'neon', label: 'Neon' }, { value: 'gold', label: 'Gold' }, { value: 'duotone', label: 'Duotone' }, { value: 'white', label: 'White' },
      ] },
      { name: 'origin', label: 'Origin', kind: 'select', default: 'sides', options: [
        { value: 'sides', label: 'Sides' }, { value: 'bottom', label: 'Bottom' }, { value: 'top', label: 'Top' }, { value: 'center', label: 'Center' },
      ] },
      { name: 'seed', label: 'Seed', kind: 'number', prefix: 'seed=', placeholder: '0' },
      { name: 'noShimmer', label: 'No shimmer', kind: 'flag', flag: 'no-shimmer' },
    ],
    help: 'A burst of confetti when the section starts. Put it on a short section.' },
  { name: 'loop', label: 'Loop source', group: 'Overlays', media: 'V', params: [],
    help: 'Loop an overlay source (e.g. a short gif) when it runs out of frames.' },

  { name: 'ease', minArgs: 1, label: 'Easing (for following)', group: 'Animation', media: 'AV',
    params: [
      { name: 'curve', label: 'Curve', kind: 'select', default: 'inout', options: EASE_CURVES },
      { name: 'duration', label: 'Duration', kind: 'time', placeholder: 'whole section' },
    ],
    help: 'Set the easing for every animated action after it in the chain.' },
];

export const ACTION_MAP: Record<string, ActionDef> = Object.fromEntries(ACTIONS.map((a) => [a.name, a]));

export const ACTION_GROUPS: ActionGroup[] = ['Basic', 'Speed & pitch', 'Audio', 'Picture', 'Geometry', 'Keying & masks', 'Overlays', 'Animation'];

// ---------------------------------------------------------------------------
// Edit methods

export interface MethodParamDef {
  name: string;
  label: string;
  kind: 'threshold' | 'number' | 'text' | 'string' | 'bool';
  default: string;
  placeholder?: string;
  help?: string;
}

export interface MethodDef {
  kind: MethodKind;
  label: string;
  short: string;
  params: MethodParamDef[];
  help: string;
}

export const METHODS: MethodDef[] = [
  { kind: 'audio', label: 'Audio loudness', short: 'Loud audio', params: [
    { name: 'threshold', label: 'Threshold', kind: 'threshold', default: '0.04', help: 'Loudest sample in each frame compared to this. As a fraction (0.04), percent (4%) or dB (-28dB).' },
    { name: 'stream', label: 'Audio stream', kind: 'text', default: 'all', placeholder: 'all', help: 'Which audio stream to analyze: all, or a number starting at 0.' },
    { name: 'channel', label: 'Channel', kind: 'text', default: 'all', placeholder: 'all', help: 'Analyze one named channel (left, right, center) or all.' },
  ], help: 'Active where the audio is louder than the threshold. The default method.' },
  { kind: 'motion', label: 'Motion', short: 'Motion', params: [
    { name: 'threshold', label: 'Threshold', kind: 'threshold', default: '0.02', help: 'How much the picture must change between frames.' },
    { name: 'stream', label: 'Video stream', kind: 'number', default: '0' },
    { name: 'width', label: 'Analysis width', kind: 'number', default: '400', help: 'Frames are scaled to this width before comparing.' },
    { name: 'blur', label: 'Blur', kind: 'number', default: '9', help: 'Blur applied before comparing, to ignore noise.' },
    { name: 'x', label: 'Region X', kind: 'number', default: '0', placeholder: '0–1', help: 'Only analyze a region; fractions of the frame (0–1).' },
    { name: 'y', label: 'Region Y', kind: 'number', default: '0', placeholder: '0–1' },
    { name: 'w', label: 'Region width', kind: 'number', default: '1', placeholder: '0–1' },
    { name: 'h', label: 'Region height', kind: 'number', default: '1', placeholder: '0–1' },
  ], help: 'Active where the picture changes (good for screen recordings).' },
  { kind: 'blackdetect', label: 'Black frames', short: 'Black frames', params: [
    { name: 'threshold', label: 'Black ratio', kind: 'threshold', default: '0.98', help: 'Share of pixels that must be black.' },
    { name: 'stream', label: 'Video stream', kind: 'number', default: '0' },
    { name: 'pixel-black', label: 'Pixel black level', kind: 'number', default: '0.10', help: 'A pixel counts as black at or below this luma.' },
  ], help: 'Active on mostly-black frames. Tick "Invert" to cut black frames instead.' },
  { kind: 'subtitle', label: 'Subtitle text (regex)', short: 'Subtitles', params: [
    { name: 'pattern', label: 'Pattern (regex)', kind: 'string', default: '', placeholder: 'empty = any subtitle', help: 'Regular expression matched against each subtitle line. Empty matches every line.' },
    { name: 'stream', label: 'Subtitle stream', kind: 'number', default: '0' },
    { name: 'ignore-case', label: 'Ignore case', kind: 'bool', default: '#f' },
  ], help: 'Active while a matching subtitle is on screen. Uses an embedded subtitle stream, or a .srt/.ass file with the same name as the video.' },
  { kind: 'word', label: 'Spoken word', short: 'Word', params: [
    { name: 'value', label: 'Word', kind: 'string', default: '', placeholder: 'e.g. um', help: 'Matched as a whole word in subtitle lines.' },
    { name: 'stream', label: 'Subtitle stream', kind: 'number', default: '0' },
    { name: 'ignore-case', label: 'Ignore case', kind: 'bool', default: '#t' },
  ], help: 'Active while a subtitle line contains this word. Combine with Invert to cut filler words.' },
];

export const METHOD_MAP: Record<MethodKind, MethodDef> = Object.fromEntries(METHODS.map((m) => [m.kind, m])) as Record<MethodKind, MethodDef>;

// ---------------------------------------------------------------------------
// Exports

export interface ExportDef {
  value: ExportKind;
  label: string;
  group: 'Media' | 'Editors' | 'Timeline';
  ext: string | null;
  name?: boolean;
  version?: boolean;
  help: string;
}

export const EXPORTS: ExportDef[] = [
  { value: 'default', label: 'Video / audio file', group: 'Media', ext: null, help: 'Render a finished media file.' },
  { value: 'clip-sequence', label: 'Separate clips', group: 'Media', ext: null, help: 'One media file per kept section (single input only).' },
  { value: 'premiere', label: 'Adobe Premiere Pro', group: 'Editors', ext: 'xml', name: true, help: 'FCP7 XML project you can import into Premiere Pro.' },
  { value: 'premiere-otio', label: 'Premiere Pro (OpenTimelineIO)', group: 'Editors', ext: 'otio', name: true, help: 'OpenTimelineIO timeline for Premiere.' },
  { value: 'resolve', label: 'DaVinci Resolve', group: 'Editors', ext: 'fcpxml', name: true, version: true, help: 'FCPXML timeline for DaVinci Resolve.' },
  { value: 'resolve-fcp7', label: 'DaVinci Resolve (FCP7 XML)', group: 'Editors', ext: 'xml', name: true, help: 'Legacy FCP7 XML for Resolve.' },
  { value: 'final-cut-pro', label: 'Final Cut Pro', group: 'Editors', ext: 'fcpxml', name: true, version: true, help: 'FCPXML for Final Cut Pro.' },
  { value: 'shotcut', label: 'Shotcut', group: 'Editors', ext: 'mlt', help: 'MLT project for Shotcut.' },
  { value: 'kdenlive', label: 'Kdenlive', group: 'Editors', ext: 'kdenlive', help: 'Kdenlive project.' },
  { value: 'v3', label: 'auto-editor timeline v3', group: 'Timeline', ext: 'v3', help: 'auto-editor\'s JSON timeline (layered). Re-open it here to render.' },
  { value: 'v2', label: 'auto-editor timeline v2', group: 'Timeline', ext: 'v2', help: 'Older timeline format (no transitions).' },
  { value: 'v1', label: 'auto-editor timeline v1', group: 'Timeline', ext: 'v1', help: 'Simplest timeline format (no transitions).' },
];

export const EXPORT_MAP: Record<ExportKind, ExportDef> = Object.fromEntries(EXPORTS.map((e) => [e.value, e])) as Record<ExportKind, ExportDef>;

export const CONTAINERS = [
  { value: '', label: 'Same as input' },
  { value: 'mp4', label: 'MP4' },
  { value: 'mkv', label: 'MKV' },
  { value: 'mov', label: 'MOV' },
  { value: 'webm', label: 'WebM' },
  { value: 'mp3', label: 'MP3 (audio)' },
  { value: 'm4a', label: 'M4A (audio)' },
  { value: 'wav', label: 'WAV (audio)' },
  { value: 'flac', label: 'FLAC (audio)' },
  { value: 'ogg', label: 'OGG (audio)' },
  { value: 'opus', label: 'Opus (audio)' },
];

export const MEDIA_EXTENSIONS = [
  'mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v', 'mts', 'm2ts', 'ts', 'flv', 'wmv', 'mpg', 'mpeg', '3gp', 'ogv', 'gif',
  'mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'mka',
];
export const TIMELINE_EXTENSIONS = ['v1', 'v2', 'v3', 'json', 'xml'];

export const PRESET_SUGGESTIONS = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'];
export const PROFILE_SUGGESTIONS = ['baseline', 'main', 'high', 'high10', 'main10'];
export const PIXFMT_SUGGESTIONS = ['yuv420p', 'yuv420p10le', 'yuv422p', 'yuv444p', 'rgb24', 'yuvj420p'];
export const LAYOUT_SUGGESTIONS = ['mono', 'stereo', '2.1', '5.1', '7.1'];
export const FRAMERATE_SUGGESTIONS = ['23.976', '24', '25', '29.97', '30', '50', '59.94', '60'];
export const SAMPLERATE_SUGGESTIONS = ['22050', '44100', '48000', '96000'];

// ---------------------------------------------------------------------------
// Whisper

export interface ModelDef {
  file: string;
  label: string;
  sizeMB: number;
  url: string;
  note?: string;
}

const WHISPER = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';
const PARAKEET = 'https://huggingface.co/ggml-org/parakeet-GGUF/resolve/main/';

export const MODELS: ModelDef[] = [
  { file: 'ggml-tiny.en.bin', label: 'Whisper tiny (English)', sizeMB: 74, url: WHISPER + 'ggml-tiny.en.bin', note: 'Fastest, least accurate' },
  { file: 'ggml-tiny.bin', label: 'Whisper tiny (multilingual)', sizeMB: 74, url: WHISPER + 'ggml-tiny.bin' },
  { file: 'ggml-base.en.bin', label: 'Whisper base (English)', sizeMB: 141, url: WHISPER + 'ggml-base.en.bin' },
  { file: 'ggml-base.bin', label: 'Whisper base (multilingual)', sizeMB: 141, url: WHISPER + 'ggml-base.bin' },
  { file: 'ggml-small.en.bin', label: 'Whisper small (English)', sizeMB: 465, url: WHISPER + 'ggml-small.en.bin', note: 'Good balance' },
  { file: 'ggml-small.bin', label: 'Whisper small (multilingual)', sizeMB: 465, url: WHISPER + 'ggml-small.bin', note: 'Good balance' },
  { file: 'ggml-medium.en.bin', label: 'Whisper medium (English)', sizeMB: 1462, url: WHISPER + 'ggml-medium.en.bin' },
  { file: 'ggml-medium.bin', label: 'Whisper medium (multilingual)', sizeMB: 1462, url: WHISPER + 'ggml-medium.bin' },
  { file: 'ggml-large-v3-turbo-q5_0.bin', label: 'Whisper large-v3 turbo (compressed)', sizeMB: 547, url: WHISPER + 'ggml-large-v3-turbo-q5_0.bin', note: 'Accurate and fast' },
  { file: 'ggml-large-v3-turbo.bin', label: 'Whisper large-v3 turbo', sizeMB: 1549, url: WHISPER + 'ggml-large-v3-turbo.bin' },
  { file: 'ggml-large-v3.bin', label: 'Whisper large-v3', sizeMB: 2951, url: WHISPER + 'ggml-large-v3.bin', note: 'Most accurate Whisper' },
  { file: 'ggml-parakeet-tdt-0.6b-v3-q8_0.bin', label: 'Parakeet TDT 0.6B v3', sizeMB: 637, url: PARAKEET + 'ggml-parakeet-tdt-0.6b-v3-q8_0.bin', note: 'Most accurate; 25 European languages, auto-detected' },
];

export const LANGUAGES = [
  ['auto', 'Auto-detect'], ['en', 'English'], ['pt', 'Portuguese'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
  ['it', 'Italian'], ['nl', 'Dutch'], ['pl', 'Polish'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['tr', 'Turkish'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['id', 'Indonesian'],
  ['vi', 'Vietnamese'], ['th', 'Thai'], ['sv', 'Swedish'], ['da', 'Danish'], ['no', 'Norwegian'], ['fi', 'Finnish'],
  ['cs', 'Czech'], ['el', 'Greek'], ['he', 'Hebrew'], ['hu', 'Hungarian'], ['ro', 'Romanian'],
] as const;
