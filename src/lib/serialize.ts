// Turning action chains and edit expressions into auto-editor syntax.

import { ACTION_MAP, METHOD_MAP } from './catalog';
import { str, type ActionStep, type EditSpec, type MethodNode } from './model';

// ---------------------------------------------------------------------------
// Actions

function addSource(a: Record<string, string>): string {
  const v = (k: string) => str(a[k]);
  switch (a.source || 'file') {
    case 'tone':
      return ['tone', v('note') || '69', v('wave')].filter(Boolean).join(':');
    case 'confetti': {
      // Bare numbers fill count first, so give count a value if gravity is set.
      const count = v('count') || (v('gravity') ? '200' : '');
      return ['confetti', count, v('gravity'), v('scheme'), v('origin')].filter(Boolean).join(':');
    }
    case 'drawbox':
      return ['drawbox', v('bx') || '0', v('by') || '0', v('bw') || '400', v('bh') || '200', v('bcolor') || '#ff0000'].join(':');
    default:
      return v('path');
  }
}

function serializeAdd(a: Record<string, string>): string {
  const v = (k: string) => str(a[k]);
  let out = 'add:' + addSource(a);
  if ((a.source || 'file') !== 'tone' && (v('x') || v('y') || v('scale'))) {
    out += `:${v('x') || '0'}:${v('y') || '0'}:${v('scale') || '1'}`;
  }
  if (v('followBase')) out += `:follow-base=${v('followBase')}`;
  return out;
}

export function serializeStep(s: ActionStep): string {
  if (s.name === 'raw') return str(s.raw);
  const def = ACTION_MAP[s.name];
  if (!def) return s.name;
  if (s.name === 'add') return serializeAdd(s.args);

  const values = def.params.map((p) => {
    const v = str(s.args[p.name]);
    if (p.kind === 'flag') return v === 'true' ? (p.flag ?? p.name) : '';
    return v ? (p.prefix ?? '') + v : '';
  });
  let last = -1;
  values.forEach((v, i) => {
    if (v) last = i;
  });
  if (def.minArgs) last = Math.max(last, def.minArgs - 1);
  if (def.argJoin) last = def.params.length - 1; // e.g. spin needs both halves

  const parts: string[] = [];
  for (let i = 0; i <= last; i++) {
    const p = def.params[i];
    if (values[i]) parts.push(values[i]);
    else if (p.kind === 'flag' || p.prefix) continue; // keywords are optional
    else parts.push(p.default ?? '');
  }

  let out = def.name;
  if (parts.length) out += ':' + parts.join(def.argJoin ?? ':');
  if (def.animatable && s.ease) {
    out += `:ease=${s.ease}`;
    if (str(s.easeDuration)) out += `:${str(s.easeDuration)}`;
  }
  return out;
}

export function serializeChain(steps: ActionStep[]): string {
  const parts = steps.map(serializeStep).filter(Boolean);
  return parts.length ? parts.join(',') : 'nil';
}

// ---------------------------------------------------------------------------
// Edit expressions

export function quoteEditString(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/** `explicit`: inside an operator a method must be written in call form
 *  (`audio:threshold=0.04`, never bare `audio`). */
export function serializeMethod(m: MethodNode, explicit: boolean): string {
  const def = METHOD_MAP[m.kind];
  const parts: string[] = [];
  for (const p of def.params) {
    let v = str(m.params[p.name]);
    if (!v) continue;
    if (p.kind === 'string') v = quoteEditString(String(m.params[p.name] ?? ''));
    parts.push(`${p.name}=${v}`);
  }
  if (!parts.length && explicit) {
    const first = def.params[0];
    parts.push(`${first.name}=${first.kind === 'string' ? quoteEditString(first.default) : first.default}`);
  }
  return parts.length ? `${m.kind}:${parts.join(',')}` : m.kind;
}

function withNot(m: MethodNode, inner: string): string {
  return m.negate ? `(not ${inner})` : inner;
}

/** Returns '' when the spec doesn't constrain anything (use the default). */
export function serializeEdit(spec: EditSpec): string {
  switch (spec.mode) {
    case 'all':
      return '1';
    case 'none':
      return '0';
    case 'raw':
      return str(spec.raw);
  }
  const methods = spec.methods;
  if (methods.length === 0) return '';
  if (methods.length === 1) {
    const m = methods[0];
    return withNot(m, serializeMethod(m, m.negate));
  }
  return `(${spec.combine} ${methods.map((m) => withNot(m, serializeMethod(m, true))).join(' ')})`;
}

// ---------------------------------------------------------------------------
// Thresholds

/** Convert a threshold ("0.04", "4%", "-28dB") to a 0–1 fraction. */
export function thresholdToFraction(value: string): number | null {
  const v = str(value);
  if (!v) return null;
  const db = /^(-?\d*\.?\d+)\s*dB$/.exec(v);
  if (db) return Math.pow(10, parseFloat(db[1]) / 20);
  const pct = /^(\d*\.?\d+)\s*%$/.exec(v);
  if (pct) return parseFloat(pct[1]) / 100;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fractionToDb(f: number): number {
  return f <= 0 ? -100 : 20 * Math.log10(f);
}

// ---------------------------------------------------------------------------
// Validation helpers

const NUM = String.raw`-?(?:\d+\.?\d*|\.\d+)`;
// auto-editor 31.7 keyframes are evenly spaced (no value@time yet).
const RAMP_RE = new RegExp(String.raw`^${NUM}(?:\.\.${NUM})*$`);
const LENGTH_RE = new RegExp(String.raw`^${NUM}(?:s|sec|secs|second|seconds|ms|min|minute|minutes)?$`);
const RANGE_POINT_RE = new RegExp(String.raw`^(?:start|end|${NUM}(?:s|sec|secs|second|seconds|ms|min|minute|minutes)?)$`);

export const isNumber = (v: string) => new RegExp(`^${NUM}$`).test(str(v));
export const isRamp = (v: string) => RAMP_RE.test(str(v));
export const isLength = (v: string) => LENGTH_RE.test(str(v));
export const isRangePoint = (v: string) => RANGE_POINT_RE.test(str(v));
