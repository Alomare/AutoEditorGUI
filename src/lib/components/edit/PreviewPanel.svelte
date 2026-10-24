<script lang="ts">
  import { RefreshCw, Loader2 } from '@lucide/svelte';
  import { editingArgs, previewTimelineArgs } from '$lib/args';
  import { aeError, errorText, formatDuration, runCapture } from '$lib/backend';
  import { TIMELINE_EXTENSIONS } from '$lib/catalog';
  import { extOf, inputLabel } from '$lib/model';
  import { parseLevels, parseTimeline, statsOf, type PreviewTimeline } from '$lib/preview';
  import { thresholdToFraction } from '$lib/serialize';
  import { app } from '$lib/state.svelte';
  import Toggle from '../ui/Toggle.svelte';

  let files = $derived(app.inputs.filter((i) => i.kind === 'file' && !TIMELINE_EXTENSIONS.includes(extOf(i.value))));
  $effect(() => {
    if (!files.some((f) => f.value === app.previewFile)) app.previewFile = files[0]?.value ?? '';
  });
  let target = $derived(app.previewFile);

  // What the level graph shows: the first audio/motion method of the rule.
  let graphMethod = $derived.by(() => {
    const e = app.settings.edit;
    const m = e.mode === 'builder' ? e.methods.find((x) => x.kind === 'audio' || x.kind === 'motion') : undefined;
    const kind = m?.kind ?? 'audio';
    const stream = m?.params.stream ? String(m.params.stream).trim() : '';
    return {
      kind,
      edit: stream ? `${kind}:stream=${stream}` : kind,
      threshold: m && !m.negate ? thresholdToFraction(String(m.params.threshold ?? '')) ?? (kind === 'audio' ? 0.04 : 0.02) : null,
    };
  });

  let timeline = $state.raw<PreviewTimeline | null>(null);
  let levels = $state.raw<{ key: string; values: Float32Array } | null>(null);
  let error = $state('');
  let busy = $state(false);
  let pending = false;

  const editKey = $derived(JSON.stringify(editingArgs(app.settings)));

  function friendly(msg: string): string {
    if (/subtitle stream .* does not exist/i.test(msg))
      return 'This file has no subtitles, so subtitle-based detection has nothing to match. Transcribe it first (Transcribe tab → save next to the video), or choose another detection method.';
    if (/license key/i.test(msg)) return msg + ' (Settings → License key)';
    return msg;
  }

  async function refresh() {
    const ae = app.autoEditor?.path;
    const file = target;
    if (!ae || !file) return;
    if (busy) {
      pending = true;
      return;
    }
    busy = true;
    error = '';
    try {
      const r = await runCapture(ae, previewTimelineArgs(app.settings, file), { env: app.env });
      if (r.code !== 0 || !r.stdout.trim().startsWith('{')) {
        timeline = null;
        error = friendly(aeError(r.stderr) ?? (r.stderr.trim() || 'auto-editor could not build the timeline'));
      } else {
        timeline = parseTimeline(r.stdout);
        const g = graphMethod;
        const key = `${file}|${g.edit}|${timeline.tbText}`;
        if (levels?.key !== key) {
          const lv = await runCapture(ae, ['levels', file, '--edit', g.edit, '-tb', timeline.tbText]);
          levels = lv.code === 0 ? { key, values: parseLevels(lv.stdout) } : null;
        }
      }
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
      if (pending) {
        pending = false;
        void refresh();
      }
    }
  }

  // Re-run (debounced) whenever the file or anything that affects cuts changes.
  let timer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    void editKey;
    void target;
    if (!app.prefs.autoPreview || !target || !app.autoEditor) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, 500);
    return () => {
      if (timer) clearTimeout(timer);
    };
  });

  let totalFrames = $derived.by(() => {
    if (!timeline) return 0;
    // The file's duration is known up front; levels may arrive a moment later.
    const known = (app.mediaInfo[target]?.container?.duration ?? 0) * timeline.tb;
    return Math.round(Math.max(levels?.values.length ?? 0, timeline.segments.at(-1)?.to ?? 0, known));
  });
  let stats = $derived(timeline ? statsOf(timeline, totalFrames) : null);

  // --- Drawing ---------------------------------------------------------------
  let canvas = $state<HTMLCanvasElement>();
  let width = $state(600);
  const HEIGHT = 170;
  const STRIP = 14;
  let hover = $state<{ x: number; text: string } | null>(null);

  function css(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function levelY(v: number, kind: string, max: number): number {
    if (kind === 'audio') {
      const db = v <= 0 ? -60 : Math.max(-60, 20 * Math.log10(v));
      return (db + 60) / 60;
    }
    return Math.min(1, v / max);
  }

  /** Segments are in source order; binary search, since this runs for every
   *  pixel of the graph and long files have thousands of clips. */
  function segmentAt(frame: number) {
    const segs = timeline?.segments ?? [];
    let lo = 0;
    let hi = segs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frame < segs[mid].from) hi = mid - 1;
      else if (frame >= segs[mid].to) lo = mid + 1;
      else return segs[mid];
    }
    return undefined;
  }

  function stateAt(frame: number): 'cut' | 'keep' | 'speed' | 'fx' {
    const seg = segmentAt(frame);
    if (!seg) return 'cut';
    if (Math.abs(seg.speed - 1) > 1e-3) return 'speed';
    return seg.effects ? 'fx' : 'keep';
  }

  $effect(() => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(HEIGHT * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);
    // Re-read theme colors each draw.
    void app.prefs.theme;
    const colors = { keep: css('--keep'), cut: css('--cut'), speed: css('--speed'), fx: css('--accent'), bar: css('--text-3'), grid: css('--border') };

    const vals = levels?.values;
    const n = totalFrames;
    const plotH = HEIGHT - STRIP - 6;
    if (!n) return;
    const kind = graphMethod.kind;
    let max = 0;
    if (vals) for (const v of vals) if (v > max) max = v;
    max = Math.max(max, (graphMethod.threshold ?? 0) * 2, 1e-6);

    // Grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = Math.round((plotH * i) / 4) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (let x = 0; x < width; x++) {
      const f0 = Math.floor((x / width) * n);
      const f1 = Math.max(f0 + 1, Math.floor(((x + 1) / width) * n));
      let peak = 0;
      if (vals) for (let f = f0; f < f1 && f < vals.length; f++) if (vals[f] > peak) peak = vals[f];
      const st = stateAt(Math.floor((f0 + f1) / 2));
      const h = levelY(peak, kind, max) * plotH;
      ctx.fillStyle = st === 'cut' ? colors.cut : colors.bar;
      ctx.globalAlpha = st === 'cut' ? 0.35 : 0.8;
      ctx.fillRect(x, plotH - h, 1, h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors[st];
      ctx.fillRect(x, HEIGHT - STRIP, 1, STRIP);
    }

    if (graphMethod.threshold !== null) {
      const y = Math.round(plotH - levelY(graphMethod.threshold, kind, max) * plotH) + 0.5;
      ctx.strokeStyle = colors.fx;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });

  function onmove(e: MouseEvent) {
    if (!totalFrames || !timeline) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = Math.floor((x / rect.width) * totalFrames);
    const v = levels?.values[frame];
    const st = stateAt(frame);
    const label = { cut: 'cut', keep: 'kept', speed: 'speed changed', fx: 'kept with effects' }[st];
    const lvl = v === undefined ? '' : graphMethod.kind === 'audio' ? ` · ${v <= 0 ? '−∞' : (20 * Math.log10(v)).toFixed(1)} dB` : ` · ${(v * 100).toFixed(1)}%`;
    hover = { x, text: `${formatDuration(frame / timeline.tb)}${lvl} · ${label}` };
  }

  const pct = (a: number, b: number) => (b ? Math.round((1 - a / b) * 100) : 0);
</script>

<div class="panel">
  <div class="row wrap">
    {#if files.length > 1}
      <select bind:value={app.previewFile} style="max-width: 320px">
        {#each files as f (f.id)}<option value={f.value}>{inputLabel(f)}</option>{/each}
      </select>
    {:else if files.length === 1}
      <strong class="ellipsis" title={target}>{inputLabel(files[0])}</strong>
    {/if}
    <span class="spacer"></span>
    <Toggle bind:checked={app.prefs.autoPreview} label="Update automatically" />
    <button class="btn small" onclick={refresh} disabled={!target || busy || !app.autoEditor}>
      {#if busy}<Loader2 size={13} class="spin" />{:else}<RefreshCw size={13} />{/if} Analyze
    </button>
  </div>

  {#if !app.autoEditor}
    <div class="empty">Set up auto-editor first (Settings → Tools).</div>
  {:else if !target}
    <div class="empty">
      Add a video or audio file to see what will be cut.<br />
      <span class="tiny">The preview shows exactly what auto-editor will keep, using your current settings.</span>
    </div>
  {:else}
    <div class="tiles">
      <div class="tile"><span class="k">Original</span><span class="v">{stats ? formatDuration(stats.inSeconds) : '–'}</span></div>
      <div class="tile"><span class="k">After edit</span><span class="v">{stats ? formatDuration(stats.outSeconds) : '–'}</span></div>
      <div class="tile"><span class="k">Shorter by</span><span class="v">{stats ? `${pct(stats.outSeconds, stats.inSeconds)}%` : '–'}</span></div>
      <div class="tile"><span class="k">Clips kept</span><span class="v">{stats?.clips ?? '–'}</span></div>
      <div class="tile"><span class="k">Cuts</span><span class="v">{stats?.cuts ?? '–'}</span></div>
    </div>

    <div class="graph" bind:clientWidth={width} onmousemove={onmove} onmouseleave={() => (hover = null)} role="img" aria-label="Cut preview">
      <canvas bind:this={canvas} style:width="{width}px" style:height="{HEIGHT}px"></canvas>
      {#if hover}<div class="hover" style:left="{Math.min(hover.x, width - 230)}px">{hover.text}</div>{/if}
      {#if busy && !timeline}<div class="overlay"><Loader2 size={20} class="spin" /> Analyzing… (the first run on a long file can take a while)</div>{/if}
    </div>

    <div class="legend tiny">
      <span><i style="background: var(--keep)"></i> kept</span>
      <span><i style="background: var(--cut)"></i> cut</span>
      <span><i style="background: var(--speed)"></i> speed changed</span>
      <span><i style="background: var(--accent)"></i> kept with effects</span>
      {#if graphMethod.threshold !== null}<span><i class="dash"></i> threshold</span>{/if}
      <span class="spacer"></span>
      <span class="faint">Graph: {graphMethod.kind === 'audio' ? 'loudness (dB)' : 'motion'}</span>
    </div>

    {#if error}<div class="notice danger small"><span>{error}</span></div>{/if}
  {/if}
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .k {
    font-size: 11.5px;
    color: var(--text-3);
    font-weight: 600;
  }
  .v {
    font-size: 19px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .graph {
    position: relative;
    width: 100%;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
    overflow: hidden;
    cursor: crosshair;
  }
  canvas {
    display: block;
  }
  .hover {
    position: absolute;
    top: 6px;
    padding: 2px 7px;
    border-radius: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 11.5px;
    pointer-events: none;
    white-space: nowrap;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--text-2);
    background: color-mix(in srgb, var(--surface-2) 80%, transparent);
  }
  .legend {
    display: flex;
    gap: 14px;
    align-items: center;
    color: var(--text-2);
    flex-wrap: wrap;
  }
  .legend i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-right: 4px;
    vertical-align: -1px;
  }
  .legend i.dash {
    height: 0;
    border-top: 2px dashed var(--accent);
  }
  :global(.spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
