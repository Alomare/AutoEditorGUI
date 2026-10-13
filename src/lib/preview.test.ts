import { describe, expect, it } from 'vitest';
import { parseLevels, parseTimeline, statsOf } from './preview';

// Real output from auto-editor 31.7.2 on a 6s clip with 2s of silence,
// rendered with `-w:0 speed:4 --export v3 -o -`.
const V3 = JSON.stringify({
  version: '3',
  timebase: '30/1',
  v: [[
    { src: 't.mp4', start: 0, dur: 67, offset: 0, stream: 0 },
    { src: 't.mp4', start: 67, dur: 12, offset: 17, stream: 0, effects: ['speed:4.0'] },
    { src: 't.mp4', start: 79, dur: 66, offset: 114, stream: 0 },
  ]],
  a: [[]],
});

describe('preview parsing', () => {
  it('maps sped-up clips back to source frames', () => {
    const tl = parseTimeline(V3);
    expect(tl.tb).toBe(30);
    expect(tl.outFrames).toBe(145);
    expect(tl.segments[1]).toEqual({ from: 68, to: 116, speed: 4, effects: false });
    expect(tl.segments[2].from).toBe(114);
  });

  it('reads levels after the @start marker', () => {
    expect(Array.from(parseLevels('\n@start\n0.5\n0.25\n\n'))).toEqual([0.5, 0.25]);
  });

  it('counts cuts including leading and trailing gaps', () => {
    const tl = parseTimeline(JSON.stringify({ timebase: '30000/1001', v: [[{ start: 0, dur: 30, offset: 15 }, { start: 30, dur: 30, offset: 90 }]] }));
    const st = statsOf(tl, 150);
    expect(st.clips).toBe(2);
    expect(st.cuts).toBe(3);
    expect(st.outSeconds).toBeCloseTo(60 / (30000 / 1001));
  });
});
