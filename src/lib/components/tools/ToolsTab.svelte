<script lang="ts">
  import { save } from '@tauri-apps/plugin-dialog';
  import { Copy, FileText, Loader2, Play } from '@lucide/svelte';
  import { aeError, errorText, formatBytes, formatDuration, formatFps, runCapture, writeText, type MediaInfo } from '$lib/backend';
  import { MEDIA_EXTENSIONS } from '$lib/catalog';
  import { baseName, stemOf } from '$lib/model';
  import { app } from '$lib/state.svelte';
  import Field from '../ui/Field.svelte';
  import PathInput from '../ui/PathInput.svelte';
  import Segmented from '../ui/Segmented.svelte';

  type Tool = 'info' | 'subdump' | 'desc' | 'codecs' | 'analysis' | 'cache';
  let tool = $state<Tool>('info');
  let file = $state('');
  $effect(() => {
    if (!file) file = app.inputs.find((i) => i.kind === 'file')?.value ?? '';
  });

  let busy = $state(false);
  let output = $state('');
  let error = $state('');
  let info = $state<MediaInfo | null>(null);

  // codecs
  let codecExt = $state('mp4');
  let codecKind = $state<'-encoders' | '-decoders' | '-codecs'>('-encoders');
  // analysis
  let analysisKind = $state<'levels' | 'waveform'>('levels');
  let levelsEdit = $state('audio');
  let levelsTb = $state('');
  let levelsDisplay = $state<'float' | 'd16'>('float');
  let wfStream = $state('');
  let wfChannel = $state('');
  let wfBucket = $state('');

  async function run(args: string[]): Promise<string | null> {
    const ae = app.autoEditor?.path;
    if (!ae) {
      error = 'Set up auto-editor first (Settings → Tools).';
      return null;
    }
    busy = true;
    error = '';
    output = '';
    info = null;
    try {
      const r = await runCapture(ae, args, { env: app.env });
      if (r.code !== 0) {
        error = aeError(r.stderr) ?? (r.stderr || `Exited with code ${r.code}`);
        return null;
      }
      return r.stdout || r.stderr;
    } catch (e) {
      error = errorText(e);
      return null;
    } finally {
      busy = false;
    }
  }

  async function go() {
    switch (tool) {
      case 'info': {
        const out = await run(['info', '--json', file]);
        if (out) {
          output = out;
          try {
            const parsed = JSON.parse(out) as Record<string, MediaInfo>;
            info = parsed[file] ?? Object.values(parsed)[0];
          } catch {
            info = null;
          }
        }
        break;
      }
      case 'subdump':
        output = (await run(['subdump', file])) ?? '';
        break;
      case 'desc':
        output = (await run(['desc', file])) ?? '';
        break;
      case 'codecs':
        output = (await run(['info', codecKind, codecExt.replace(/^\./, '')])) ?? '';
        break;
      case 'cache':
        output = (await run(['cache'])) ?? '';
        if (!output && !error) output = 'The cache is empty.';
        break;
      case 'analysis': {
        const args =
          analysisKind === 'levels'
            ? ['levels', file, '--edit', levelsEdit || 'audio', ...(levelsTb ? ['-tb', levelsTb] : []), '--display', levelsDisplay]
            : ['waveform', file, ...(wfStream ? ['--stream', wfStream] : []), ...(wfChannel ? ['--channel', wfChannel] : []), ...(wfBucket ? ['--samples-per-bucket', wfBucket] : []), '--display', levelsDisplay];
        const out = await run(args);
        if (out) {
          const path = await save({ defaultPath: `${stemOf(file)}-${analysisKind}.txt`, filters: [{ name: 'Text', extensions: ['txt'] }] });
          if (path) {
            await writeText(path, out);
            output = `Saved ${out.split('\n').length.toLocaleString()} lines (${formatBytes(out.length)}) to ${path}\n\nFirst lines:\n${out.split('\n').slice(0, 20).join('\n')}`;
          } else output = out.split('\n').slice(0, 500).join('\n');
        }
        break;
      }
    }
  }

  async function cache(action: 'clean' | 'clear') {
    const out = await run(['cache', action]);
    output = out || (action === 'clear' ? 'Cache cleared.' : 'Cache cleaned.');
  }

  const needsFile = $derived(tool === 'info' || tool === 'subdump' || tool === 'desc' || tool === 'analysis');
  const TOOLS: { value: Tool; label: string; help: string }[] = [
    { value: 'info', label: 'Media info', help: 'Streams, codecs, resolution, frame rate and duration (auto-editor info).' },
    { value: 'subdump', label: 'Subtitles', help: 'Print the text of embedded subtitle streams (auto-editor subdump). Bitmap subtitles can\'t be dumped.' },
    { value: 'desc', label: 'Description', help: 'Show the file\'s embedded description, e.g. chapters from a YouTube download (auto-editor desc).' },
    { value: 'codecs', label: 'Codec support', help: 'Which encoders/decoders this auto-editor build has for a container (auto-editor info -encoders).' },
    { value: 'analysis', label: 'Analysis data', help: 'Export raw audio/motion levels or a waveform as text, for use in other programs (auto-editor levels / waveform).' },
    { value: 'cache', label: 'Cache', help: 'auto-editor caches analysis results (up to 10 files) so re-editing is instant (auto-editor cache).' },
  ];
</script>

<div class="tools">
  <nav class="card side">
    {#each TOOLS as t (t.value)}
      <button class:active={tool === t.value} onclick={() => { tool = t.value; output = ''; error = ''; info = null; }}>{t.label}</button>
    {/each}
  </nav>

  <section class="card main">
    <h2>{TOOLS.find((t) => t.value === tool)?.label}</h2>
    <p class="small muted">{TOOLS.find((t) => t.value === tool)?.help}</p>

    {#if needsFile}
      <Field label="File">
        <PathInput bind:value={file} filters={[{ name: 'Media', extensions: MEDIA_EXTENSIONS }, { name: 'All files', extensions: ['*'] }]} placeholder="Choose a media file" />
      </Field>
    {/if}

    {#if tool === 'codecs'}
      <div class="row">
        <Field label="Container extension"><input type="text" bind:value={codecExt} style="width: 120px" placeholder="mp4" /></Field>
        <Field label="Show"><Segmented small bind:value={codecKind} options={[{ value: '-encoders', label: 'Encoders' }, { value: '-decoders', label: 'Decoders' }, { value: '-codecs', label: 'Codecs' }]} /></Field>
      </div>
    {:else if tool === 'analysis'}
      <Field label="Data"><Segmented small bind:value={analysisKind} options={[{ value: 'levels', label: 'Levels (per frame)' }, { value: 'waveform', label: 'Waveform (audio samples)' }]} /></Field>
      <div class="grid3">
        {#if analysisKind === 'levels'}
          <Field label="Method" help="Any edit method, e.g. audio, motion, audio:stream=1."><input type="text" bind:value={levelsEdit} placeholder="audio" /></Field>
          <Field label="Timebase" help="Chunks per second. Default 30."><input type="text" bind:value={levelsTb} placeholder="30" /></Field>
        {:else}
          <Field label="Audio stream"><input type="number" min="0" bind:value={wfStream} placeholder="0" /></Field>
          <Field label="Channels" help="Comma-separated channel names, e.g. FL,FR."><input type="text" bind:value={wfChannel} placeholder="all" /></Field>
          <Field label="Samples per bucket"><input type="number" min="1" bind:value={wfBucket} placeholder="256" /></Field>
        {/if}
        <Field label="Number format"><Segmented small bind:value={levelsDisplay} options={[{ value: 'float', label: 'Float' }, { value: 'd16', label: '16-bit' }]} /></Field>
      </div>
    {/if}

    <div class="row">
      <button class="btn primary" onclick={go} disabled={busy || (needsFile && !file)}>
        {#if busy}<Loader2 size={14} class="spin" />{:else}<Play size={14} />{/if}
        {tool === 'cache' ? 'List cache' : tool === 'analysis' ? 'Export…' : 'Run'}
      </button>
      {#if tool === 'cache'}
        <button class="btn" onclick={() => cache('clean')} disabled={busy}>Clean old entries</button>
        <button class="btn danger" onclick={() => cache('clear')} disabled={busy}>Clear all</button>
      {/if}
    </div>

    {#if error}<div class="notice danger small">{error}</div>{/if}

    {#if info}
      <div class="info">
        <div class="kv"><span>File</span><strong>{baseName(file)}</strong></div>
        <div class="kv"><span>Duration</span><strong>{formatDuration(info.container?.duration ?? 0)}</strong></div>
        {#if info.container?.bitrate}<div class="kv"><span>Bitrate</span><strong>{Math.round(info.container.bitrate / 1000)} kb/s</strong></div>{/if}
        {#if info.recommendedTimebase}<div class="kv"><span>Timebase</span><strong>{info.recommendedTimebase}</strong></div>{/if}
        {#each info.video ?? [] as v, i (i)}
          <div class="kv"><span>Video {i}</span><strong>{v.codec} · {v.resolution[0]}×{v.resolution[1]} · {formatFps(v.fps)} fps{v.pix_fmt ? ` · ${v.pix_fmt}` : ''}{v.lang ? ` · ${v.lang}` : ''}</strong></div>
        {/each}
        {#each info.audio ?? [] as a, i (i)}
          <div class="kv"><span>Audio {i}</span><strong>{a.codec} · {a.layout} · {a.samplerate} Hz{a.lang ? ` · ${a.lang}` : ''}</strong></div>
        {/each}
        {#each info.subtitle ?? [] as s, i (i)}
          <div class="kv"><span>Subtitle {i}</span><strong>{s.codec}{s.lang ? ` · ${s.lang}` : ''}</strong></div>
        {/each}
      </div>
      <details><summary class="small">Raw JSON</summary><pre class="out">{output}</pre></details>
    {:else if output}
      <div class="row">
        <span class="spacer"></span>
        <button class="btn ghost small" onclick={() => { navigator.clipboard.writeText(output); app.notify('Copied', 'success'); }}><Copy size={13} /> Copy</button>
        <button class="btn ghost small" onclick={async () => { const p = await save({ filters: [{ name: 'Text', extensions: ['txt'] }] }); if (p) await writeText(p, output); }}><FileText size={13} /> Save</button>
      </div>
      <pre class="out">{output}</pre>
    {/if}
  </section>
</div>

<style>
  .tools {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    max-width: 1200px;
    margin: 0 auto;
  }
  .side {
    display: flex;
    flex-direction: column;
    padding: 6px;
    gap: 2px;
  }
  .side button {
    text-align: left;
    border: 0;
    background: transparent;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    font-weight: 500;
    color: var(--text-2);
  }
  .side button:hover {
    background: var(--surface-2);
  }
  .side button.active {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .main {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .out {
    margin: 0;
    max-height: 460px;
    overflow: auto;
    padding: 10px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    font: 12px/1.5 var(--mono);
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
  }
  .info {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .kv {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 10px;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .kv:last-child {
    border-bottom: 0;
  }
  .kv span {
    color: var(--text-3);
  }
  .kv strong {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  details summary {
    cursor: pointer;
    color: var(--text-2);
  }
</style>
