// Parsing for the cut preview: auto-editor's v3 timeline JSON and `levels`.

export interface Segment {
  /** Source frames [from, to) in the timeline's timebase. */
  from: number;
  to: number;
  speed: number;
  /** Has effects other than speed (zoom, volume…). */
  effects: boolean;
}

export interface PreviewTimeline {
  tb: number;
  tbText: string;
  segments: Segment[];
  /** Output length in frames. */
  outFrames: number;
}

function parseRational(text: string): number {
  const [a, b] = String(text).split('/').map(Number);
  return b ? a / b : a;
}

interface V3Clip {
  start: number;
  dur: number;
  offset: number;
  effects?: string[];
}

export function parseTimeline(json: string): PreviewTimeline {
  const data = JSON.parse(json) as { timebase: string; v?: V3Clip[][]; a?: V3Clip[][] };
  const tb = parseRational(data.timebase) || 30;
  const track = data.v?.find((t) => t.length) ?? data.a?.find((t) => t.length) ?? [];
  let outFrames = 0;
  const segments = track.map((c) => {
    let speed = 1;
    let effects = false;
    for (const e of c.effects ?? []) {
      const m = /^(speed|varispeed):([\d.]+)/.exec(e);
      if (m) speed *= parseFloat(m[2]);
      else effects = true;
    }
    outFrames = Math.max(outFrames, c.start + c.dur);
    // Offsets of sped-up clips are in speed-scaled units.
    return { from: c.offset * speed, to: (c.offset + c.dur) * speed, speed, effects };
  });
  return { tb, tbText: data.timebase, segments, outFrames };
}

export function parseLevels(text: string): Float32Array {
  const start = text.indexOf('@start');
  const body = start >= 0 ? text.slice(start + 6) : text;
  const values: number[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const v = Number(t);
    if (Number.isFinite(v)) values.push(v);
  }
  return Float32Array.from(values);
}

export interface PreviewStats {
  inSeconds: number;
  outSeconds: number;
  clips: number;
  cuts: number;
}

export function statsOf(tl: PreviewTimeline, totalFrames: number): PreviewStats {
  let cuts = 0;
  let prevEnd = 0;
  for (const s of tl.segments) {
    if (s.from > prevEnd + 0.5) cuts++;
    prevEnd = s.to;
  }
  if (totalFrames > prevEnd + 0.5) cuts++;
  return {
    inSeconds: totalFrames / tl.tb,
    outSeconds: tl.outFrames / tl.tb,
    clips: tl.segments.length,
    cuts,
  };
}
