import { describe, expect, it } from 'vitest';

import {
  commandLine,
  editingArgs,
  exportValue,
  outputArgs,
  outputPathFor,
  previewTimelineArgs,
  quoteArg,
  renderArgs,
  splitArgs,
} from './args';
import { defaultSettings, dirName, method, step, uid, type EditSettings } from './model';
import { serializeChain, serializeEdit, serializeStep, thresholdToFraction } from './serialize';

const settings = (patch: Partial<EditSettings> = {}): EditSettings => ({ ...defaultSettings(), ...patch });

describe('defaults', () => {
  it('produce no options at all', () => {
    expect(editingArgs(settings())).toEqual([]);
    expect(outputArgs(settings())).toEqual([]);
  });

  it('end options before inputs', () => {
    expect(renderArgs(settings(), ['-weird.mp4'], 'out.mp4')).toEqual(['--output', 'out.mp4', '--', '-weird.mp4']);
  });
});

describe('edit expressions', () => {
  it('writes a single method with only the params that were set', () => {
    const s = settings();
    s.edit.methods = [method('audio', { threshold: '4%' })];
    expect(editingArgs(s)).toEqual(['--edit', 'audio:threshold=4%']);
  });

  it('uses call form for every method inside an operator', () => {
    const s = settings();
    s.edit.methods = [method('audio'), method('motion', { threshold: '0.03', x: '0.5' })];
    expect(serializeEdit(s.edit)).toBe('(or audio:threshold=0.04 motion:threshold=0.03,x=0.5)');
  });

  it('wraps inverted methods in not', () => {
    const s = settings();
    s.edit.methods = [method('blackdetect', {}, true)];
    expect(serializeEdit(s.edit)).toBe('(not blackdetect:threshold=0.98)');
    s.edit.combine = 'and';
    s.edit.methods = [method('audio', { stream: '0' }), method('word', { value: 'um' }, true)];
    expect(serializeEdit(s.edit)).toBe('(and audio:stream=0 (not word:value="um"))');
  });

  it('quotes and escapes subtitle strings', () => {
    const s = settings();
    s.edit.methods = [method('subtitle', { pattern: 'say "hi", ok\\b', 'ignore-case': '#t' })];
    expect(serializeEdit(s.edit)).toBe('subtitle:pattern="say \\"hi\\", ok\\\\b",ignore-case=#t');
  });

  it('supports keep-all, cut-all and raw', () => {
    const s = settings();
    s.edit.mode = 'all';
    expect(editingArgs(s)).toEqual(['--edit', '1']);
    s.edit.mode = 'none';
    expect(editingArgs(s)).toEqual(['--edit', '0']);
    s.edit.mode = 'raw';
    s.edit.raw = ' (or audio:0.03 motion:0.06) ';
    expect(editingArgs(s)).toEqual(['--edit', '(or audio:0.03 motion:0.06)']);
  });

  it('adds label classes with their actions', () => {
    const s = settings();
    s.labels = [{ id: uid(), label: 2, edit: { mode: 'builder', combine: 'or', methods: [method('motion', { threshold: '0.02' })], raw: '' }, actions: [step('zoom', { value: '2' })] }];
    expect(editingArgs(s)).toEqual(['--edit:2', 'motion:threshold=0.02', '--when:2', 'zoom:2']);
  });
});

describe('actions', () => {
  it('fills skipped positional params with defaults and drops trailing ones', () => {
    expect(serializeStep(step('deesser', { freq: '0.3' }))).toBe('deesser:0.5:0.5:0.3');
    expect(serializeStep(step('deesser', { intensity: '0.8' }))).toBe('deesser:0.8');
    expect(serializeStep(step('pixelate'))).toBe('pixelate');
  });

  it('handles spin, flags, keyword params and easing', () => {
    expect(serializeStep(step('spin', { rate: '-45' }))).toBe('spin:0/-45');
    expect(serializeStep(step('mask', { x: '10', y: '10', w: '300', h: '300', invert: 'true' }))).toBe('mask:10:10:300:300:0:0:invert');
    expect(serializeStep(step('confetti', { scheme: 'neon', seed: '7' }))).toBe('confetti:200:1.4:neon:sides:seed=7');
    expect(serializeStep({ ...step('zoom', { value: '1..1.5' }), ease: 'inout', easeDuration: '2sec' })).toBe('zoom:1..1.5:ease=inout:2sec');
    expect(serializeStep(step('ease', { curve: 'out' }))).toBe('ease:out');
  });

  it('builds add layers', () => {
    expect(serializeStep(step('add', { path: 'C:\\logo.png' }))).toBe('add:C:\\logo.png');
    expect(serializeStep(step('add', { path: 'pip.mp4', x: '900', y: '60', scale: '0.25' }))).toBe('add:pip.mp4:900:60:0.25');
    expect(serializeStep(step('add', { source: 'tone', note: '36', wave: 'saw', x: '5' }))).toBe('add:tone:36:saw');
    expect(serializeStep(step('add', { source: 'confetti', gravity: '3' }))).toBe('add:confetti:200:3');
    expect(serializeStep(step('add', { source: 'drawbox', followBase: 'false' }))).toBe('add:drawbox:0:0:400:200:#ff0000:follow-base=false');
  });

  it('chains with commas and keeps raw text', () => {
    expect(serializeChain([step('speed', { value: '3' }), step('volume', { value: '0.5' })])).toBe('speed:3,volume:0.5');
    expect(serializeChain([{ ...step('raw'), raw: ' zoom:1..2 ' }])).toBe('zoom:1..2');
    expect(serializeChain([])).toBe('nil');
  });

  it('only passes actions that differ from the defaults', () => {
    const s = settings({ whenInactive: [step('speed', { value: '8' })], whenActive: [step('nil')] });
    expect(editingArgs(s)).toEqual(['--when-inactive', 'speed:8']);
  });
});

describe('pacing and ranges', () => {
  it('writes margin once when both sides match', () => {
    expect(editingArgs(settings({ marginBefore: '0.3s', marginAfter: '0.3s' }))).toEqual(['--margin', '0.3s']);
    expect(editingArgs(settings({ marginBefore: '0.3s', marginAfter: '1.5sec' }))).toEqual(['--margin', '0.3s,1.5sec']);
  });

  it('writes smoothing and transitions', () => {
    expect(editingArgs(settings({ smooth: { mode: 'off', minCut: '', minClip: '' } }))).toEqual(['--smooth', '0']);
    expect(editingArgs(settings({ smooth: { mode: 'custom', minCut: '0.5s', minClip: '0.2s' } }))).toEqual(['--smooth', '0.5s,0.2s']);
    expect(editingArgs(settings({ transition: { enabled: true, duration: '1sec', minCut: '0' } }))).toEqual(['--transition', 'dissolve:1sec:0']);
  });

  it('gives every range its own flag and skips incomplete rows', () => {
    const s = settings({
      cut: [{ id: 'a', start: '0', stop: '30' }, { id: 'b', start: '-10sec', stop: 'end' }, { id: 'c', start: '5', stop: '' }],
      setSpeed: [{ id: 'd', speed: '2', start: '0', stop: '30sec' }],
      setAction: [{ id: 'e', start: '1sec', stop: '2sec', actions: [step('zoom', { value: '2' })] }],
    });
    expect(editingArgs(s)).toEqual(['--cut', '0,30', '--cut', '-10sec,end', '--set-speed', '2,0,30sec', '--set-action', 'zoom:2,1sec,2sec']);
  });
});

describe('export and output', () => {
  it('passes timeline names with escaped quotes', () => {
    expect(exportValue(settings({ exportKind: 'premiere', exportName: 'My "Cool" Project' }))).toBe('premiere:name="My \\"Cool\\" Project"');
    expect(exportValue(settings({ exportKind: 'resolve', exportVersion: '10' }))).toBe('resolve:version=10');
    expect(exportValue(settings({ exportKind: 'shotcut', exportName: 'ignored' }))).toBe('shotcut');
    expect(exportValue(settings())).toBeNull();
  });

  it('writes encoding, container and normalize options', () => {
    const s = settings({
      videoCodec: 'libx265', crf: '23', preset: 'slow', scale: '0.5', faststart: 'off', an: true,
      audioCodec: 'aac', audioBitrate: '192k',
      normalize: { mode: 'ebu', i: '-16', lra: '', tp: '-1', gain: '', peak: '' },
    });
    expect(outputArgs(s)).toEqual([
      '-an', '--no-faststart', '--video-codec', 'libx265', '-crf', '23', '--preset', 'slow', '--scale', '0.5',
      '--audio-codec', 'aac', '--audio-bitrate', '192k', '--audio-normalize', 'ebu:i=-16,tp=-1',
    ]);
    expect(outputArgs(settings({ normalize: { mode: 'peak', i: '', lra: '', tp: '', gain: '', peak: '' } }))).toEqual(['--audio-normalize', 'peak:-3']);
  });

  it('adds the managed yt-dlp unless the user passed one', () => {
    expect(outputArgs(settings(), { ytdlpPath: 'C:\\app\\bin\\yt-dlp.exe' })).toEqual(['--yt-dlp-location', 'C:\\app\\bin\\yt-dlp.exe']);
    const own = settings({ extraArgs: '--yt-dlp-location "D:\\tools\\yt-dlp.exe"' });
    expect(renderArgs(own, ['https://x.y/v'], null, { ytdlpPath: 'C:\\app\\bin\\yt-dlp.exe' })).toEqual([
      '--yt-dlp-location', 'D:\\tools\\yt-dlp.exe', '--', 'https://x.y/v',
    ]);
  });

  it('only passes yt-dlp when an input is a URL', () => {
    const ctx = { ytdlpPath: 'C:\\bin\\yt-dlp.exe' };
    expect(renderArgs(settings(), ['a.mp4'], null, ctx)).toEqual(['--', 'a.mp4']);
    expect(renderArgs(settings(), ['https://x.y/v'], null, ctx)).toEqual(['--yt-dlp-location', 'C:\\bin\\yt-dlp.exe', '--', 'https://x.y/v']);
  });

  it('names outputs next to the input with the right extension', () => {
    const file = { id: '1', kind: 'file' as const, value: 'C:\\Videos\\talk.mov' };
    expect(outputPathFor(settings(), file, 'D:\\out')).toBe('C:\\Videos\\talk_ALTERED.mov');
    expect(outputPathFor(settings({ container: 'mp4', outputDir: 'D:\\out' }), file, '')).toBe('D:\\out\\talk_ALTERED.mp4');
    expect(outputPathFor(settings({ exportKind: 'resolve', outputSuffix: '' }), file, '')).toBe('C:\\Videos\\talk.fcpxml');
    expect(outputPathFor(settings(), { id: '2', kind: 'url', value: 'https://x.y/v' }, 'D:\\out')).toBeNull();
    const mic = outputPathFor(settings(), { id: '3', kind: 'mic', value: ':mic' }, 'D:\\rec', new Date(2026, 9, 13, 9, 5, 7));
    expect(mic).toBe('D:\\rec\\recording-20261013-090507_ALTERED.wav');
    expect(outputPathFor(settings(), { id: '4', kind: 'file', value: 'E:\\clip.mp4' }, '')).toBe('E:\\clip_ALTERED.mp4');
  });

  it('keeps the root when taking a folder name', () => {
    expect(dirName('C:\\Videos\\talk.mov')).toBe('C:\\Videos');
    expect(dirName('E:\\clip.mp4')).toBe('E:\\');
    expect(dirName('/clip.mp4')).toBe('/');
    expect(dirName('/home/me/clip.mp4')).toBe('/home/me');
    expect(dirName('clip.mp4')).toBe('');
  });

  it('builds the preview command', () => {
    expect(previewTimelineArgs(settings({ marginBefore: '0.1s', marginAfter: '0.1s' }), 'a.mp4')).toEqual(['--margin', '0.1s', '--export', 'v3', '--output', '-', '--', 'a.mp4']);
  });
});

describe('robustness', () => {
  it('accepts numbers from number inputs where strings are expected', () => {
    const s = settings({ resWidth: 1080 as unknown as string, resHeight: 1920 as unknown as string, crf: 23 as unknown as string });
    s.whenInactive = [step('speed', { value: 8 as unknown as string })];
    s.setSpeed = [{ id: 'x', speed: 2 as unknown as string, start: '0', stop: 30 as unknown as string }];
    expect(editingArgs(s)).toEqual(['--when-inactive', 'speed:8', '--set-speed', '2,0,30', '--resolution', '1080,1920']);
    expect(outputArgs(s)).toEqual(['-crf', '23']);
  });
});

describe('command-line text', () => {
  it('splits like a shell but keeps backslashes', () => {
    expect(splitArgs(`-c:v libx264  --yt-dlp-extras "-f best" 'C:\\a b\\c.mp4'`)).toEqual(['-c:v', 'libx264', '--yt-dlp-extras', '-f best', 'C:\\a b\\c.mp4']);
    expect(splitArgs('   ')).toEqual([]);
    expect(splitArgs('""')).toEqual(['']);
  });

  it('quotes only when needed', () => {
    expect(quoteArg('C:\\Videos\\a.mp4')).toBe('C:\\Videos\\a.mp4');
    expect(quoteArg('C:\\My Videos\\a.mp4')).toBe('"C:\\My Videos\\a.mp4"');
    expect(quoteArg('premiere:name="X"')).toBe('"premiere:name=\\"X\\""');
    expect(commandLine('auto-editor', ['--edit', '(or audio:0.04 motion:0.02)'])).toBe('auto-editor --edit "(or audio:0.04 motion:0.02)"');
  });
});

describe('thresholds', () => {
  it('reads fractions, percents and dB', () => {
    expect(thresholdToFraction('0.04')).toBe(0.04);
    expect(thresholdToFraction('4%')).toBe(0.04);
    expect(thresholdToFraction('-20dB')).toBeCloseTo(0.1);
    expect(thresholdToFraction('abc')).toBeNull();
  });
});
