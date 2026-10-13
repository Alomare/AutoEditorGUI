// Runs generated command lines through a real auto-editor to prove it accepts
// them. Skipped unless AE_BIN points at an auto-editor executable:
//   AE_BIN=path/to/auto-editor.exe npm test
// Needs ffmpeg on PATH to create the test clip.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { previewStatsArgs, previewTimelineArgs, renderArgs } from './args';
import { ACTIONS } from './catalog';
import { defaultSettings, method, step, type ActionStep, type EditSettings } from './model';
import { serializeStep } from './serialize';

const AE = process.env.AE_BIN;
const suite = AE ? describe : describe.skip;

let dir = '';
let clip = '';

function run(args: string[]) {
  const r = spawnSync(AE!, args, { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function timeline(s: EditSettings) {
  const r = run(previewTimelineArgs(s, clip));
  expect(r.stderr, r.stderr).not.toMatch(/Error!/);
  expect(r.code).toBe(0);
  return JSON.parse(r.stdout) as { v: { offset: number; dur: number; effects?: string[] }[][] };
}

suite('auto-editor accepts generated arguments', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aegui-'));
    clip = join(dir, 'clip.mp4');
    // 6s: tone, 2s of silence, tone. Plus a subtitle sidecar.
    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=6',
      '-f', 'lavfi', '-i', "sine=frequency=440:duration=6,volume='if(between(t,2,4),0,1)':eval=frame",
      '-shortest', '-c:v', 'libx264', '-c:a', 'aac', clip,
    ]);
    writeFileSync(join(dir, 'clip.srt'), '1\n00:00:00,500 --> 00:00:01,500\nsay "hi", um ok\n\n2\n00:00:04,500 --> 00:00:05,500\nsomething else\n');
  });

  it('default settings cut the silent middle', () => {
    expect(timeline(defaultSettings()).v[0].length).toBe(2);
  });

  it('every edit method form', () => {
    const forms: EditSettings['edit'][] = [
      { mode: 'builder', combine: 'or', methods: [method('audio', { threshold: '-28dB', channel: 'all' })], raw: '' },
      { mode: 'builder', combine: 'and', methods: [method('audio', { threshold: '4%' }), method('motion', { x: '0', w: '0.5' })], raw: '' },
      { mode: 'builder', combine: 'xor', methods: [method('audio'), method('blackdetect', {}, true)], raw: '' },
      { mode: 'builder', combine: 'or', methods: [method('subtitle', { pattern: 'say "hi", um', 'ignore-case': '#t' })], raw: '' },
      { mode: 'builder', combine: 'or', methods: [method('subtitle')], raw: '' },
      { mode: 'builder', combine: 'or', methods: [method('audio'), method('word', { value: 'um' }, true)], raw: '' },
      { mode: 'all', combine: 'or', methods: [], raw: '' },
    ];
    for (const edit of forms) timeline({ ...defaultSettings(), edit });
  });

  it('the subtitle pattern really matches (escaping survives)', () => {
    const s = defaultSettings();
    s.edit.methods = [method('subtitle', { pattern: 'say "hi", um' })];
    const clips = timeline(s).v[0];
    expect(clips.length).toBe(1);
    expect(clips[0].offset).toBeLessThan(30);
  });

  it('every action with defaults (except license-only add)', () => {
    const examples: Record<string, Record<string, string>> = {
      speed: { value: '2' }, varispeed: { value: '1.5' }, pitch: { semitones: '12' },
      volume: { value: '0..1' }, deesser: { freq: '0.3' }, duck: { amount: '0.5' },
      opacity: { value: '0..1' }, zoom: { value: '1..1.5..1' }, pixelate: { w: '1..32', h: '8' },
      aberration: { edge: 'wrap' }, lens: { k2: '0.1' }, spin: { rate: '-45' }, pos: { x: '0..100', y: '10', scale: '0.5' },
      drawbox: { color: 'red' }, confine: { invert: 'true' }, mask: { radius: '-1', feather: '4' },
      colorkey: {}, chromakey: { similar: '0.3' }, choke: { n: '2' },
      confetti: { scheme: 'neon', seed: '3', noShimmer: 'true' }, ease: { curve: 'out', duration: '1sec' },
    };
    const failures: string[] = [];
    for (const def of ACTIONS) {
      if (def.name === 'add') continue;
      // Both with example values and with every field left empty.
      for (const args of [examples[def.name] ?? {}, {}]) {
        const chain: ActionStep[] = [step(def.name, args)];
        if (def.name === 'ease') chain.push(step('zoom', { value: '1..2' }));
        const s = defaultSettings();
        s.whenInactive = chain;
        const r = run(previewStatsArgs(s, clip));
        if (r.code !== 0 || /Error!/.test(r.stderr)) failures.push(`${serializeStep(chain[0])} -> ${r.stderr.trim()}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('eased animated actions', () => {
    const s = defaultSettings();
    s.whenActive = [{ ...step('zoom', { value: '1..1.5' }), ease: 'inout', easeDuration: '1sec' }];
    timeline(s);
  });

  it('add reaches the license check (syntax accepted)', () => {
    const s = defaultSettings();
    s.whenActive = [step('add', { source: 'tone', note: '60' }), step('volume', { value: '1..0' })];
    const r = run(previewStatsArgs(s, clip));
    expect(r.stderr).toMatch(/license key/i);
  });

  it('labels, pacing and manual ranges', () => {
    const s = defaultSettings();
    s.labels = [{ id: 'l', label: 2, edit: { mode: 'builder', combine: 'or', methods: [method('audio', { threshold: '50%' })], raw: '' }, actions: [step('speed', { value: '1.5' })] }];
    s.marginBefore = '0.1s';
    s.marginAfter = '0.5sec';
    s.smooth = { mode: 'custom', minCut: '0.3s', minClip: '0.1s' };
    s.transition = { enabled: true, duration: '0.5s', minCut: '0' };
    s.cut = [{ id: 'c', start: '-1sec', stop: 'end' }];
    s.keep = [{ id: 'k', start: '2.2sec', stop: '2.5sec' }];
    s.setSpeed = [{ id: 's', speed: '2', start: '0', stop: '15' }];
    s.setAction = [{ id: 'a', start: '1sec', stop: '1.5sec', actions: [step('invert')] }];
    s.frameRate = '25';
    s.resWidth = '640';
    s.resHeight = '360';
    s.background = '#112233';
    timeline(s);
  });

  it('renders with encoding options and every export target', () => {
    const s = defaultSettings();
    Object.assign(s, {
      videoCodec: 'libx264', crf: '28', preset: 'ultrafast', vprofile: 'main', pixFmt: 'yuv420p', gop: '60', scale: '0.5',
      audioCodec: 'aac', audioBitrate: '96k', audioLayout: 'mono', faststart: 'off', noPartialLossless: true,
      normalize: { mode: 'ebu', i: '-16', lra: '', tp: '-1.5', gain: '', peak: '' },
    } satisfies Partial<EditSettings>);
    const out = join(dir, 'render.mp4');
    const r = run(renderArgs(s, [clip], out));
    expect(r.stderr).not.toMatch(/Error!/);
    expect(r.code).toBe(0);

    for (const kind of ['premiere', 'premiere-otio', 'resolve', 'resolve-fcp7', 'final-cut-pro', 'shotcut', 'kdenlive', 'clip-sequence', 'v1', 'v2', 'v3'] as const) {
      const e = { ...defaultSettings(), exportKind: kind, exportName: 'My "Proj"', exportVersion: kind.includes('resolve') || kind === 'final-cut-pro' ? '10' : '' };
      const target = join(dir, `export-${kind}`);
      const res = run(renderArgs(e, [clip], target));
      expect(`${kind}: ${res.stderr}`).not.toMatch(/Error!/);
      expect(res.code).toBe(0);
    }
  });
});
