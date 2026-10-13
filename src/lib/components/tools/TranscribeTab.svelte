<script lang="ts">
  import { save } from '@tauri-apps/plugin-dialog';
  import { openPath } from '@tauri-apps/plugin-opener';
  import { AudioLines, Copy, Download, FileText, Mic, Scissors, Square } from '@lucide/svelte';
  import { commandLine } from '$lib/args';
  import { listFiles, writeText, type FileEntry } from '$lib/backend';
  import { LANGUAGES, MEDIA_EXTENSIONS } from '$lib/catalog';
  import { queue, type Job } from '$lib/jobs.svelte';
  import { baseName, dirName, joinPath, method, stemOf, str } from '$lib/model';
  import { app } from '$lib/state.svelte';
  import Field from '../ui/Field.svelte';
  import PathInput from '../ui/PathInput.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Toggle from '../ui/Toggle.svelte';

  const w = $derived(app.whisper);

  let models = $state<FileEntry[]>([]);
  $effect(() => {
    void app.info;
    if (app.info) listFiles(app.info.paths.models, ['bin']).then((m) => (models = m));
  });
  $effect(() => {
    if (!w.model && models.length) w.model = models[0].path;
  });

  let isParakeet = $derived(/parakeet/i.test(baseName(w.model)));
  let fileInputs = $derived(app.inputs.filter((i) => i.kind === 'file'));
  $effect(() => {
    if (!w.file && fileInputs.length) w.file = fileInputs[0].value;
  });

  let outputPath = $derived.by(() => {
    if (w.destination === 'screen') return '';
    if (w.destination === 'custom') return w.customOutput;
    const ext = w.format === 'text' ? 'txt' : w.format;
    if (w.source === 'mic') return joinPath(app.prefs.defaultOutputDir || app.videosDir, `transcript-${Date.now()}.${ext}`);
    return w.file ? joinPath(dirName(w.file), `${stemOf(w.file)}.${ext}`) : '';
  });

  let args = $derived.by(() => {
    const a = ['whisper', w.source === 'mic' ? ':mic' : w.file || 'input.mp4', w.model || 'model.bin'];
    if (!isParakeet && w.language && w.language !== 'auto') a.push('--language', w.language);
    a.push('--format', w.format);
    if (outputPath) a.push('--output', outputPath);
    if (w.translate && !isParakeet) a.push('--translate');
    if (w.splitWords) a.push('--split-words');
    if (str(w.prompt) && !isParakeet) a.push('--prompt', str(w.prompt));
    if (str(w.threads)) a.push('--threads', str(w.threads));
    if (str(w.queue)) a.push('--queue', str(w.queue));
    if (str(w.threshold)) a.push('--threshold', str(w.threshold));
    if (w.debug) a.push('--debug');
    return a;
  });

  let problems = $derived.by(() => {
    const p: string[] = [];
    if (!app.autoEditor) p.push('Set up auto-editor first (Settings → Tools).');
    if (!w.model) p.push('Choose or download a model.');
    if (w.source === 'file' && !w.file) p.push('Choose a file to transcribe.');
    if (w.destination === 'custom' && !w.customOutput) p.push('Choose where to save the transcript.');
    return p;
  });

  let lastJob = $state<Job | null>(null);
  let job = $derived(lastJob ? queue.jobs.find((j) => j.id === lastJob!.id) ?? null : null);
  let transcript = $derived(job?.stdout.join('\n') ?? '');

  function start() {
    if (problems.length) return;
    const [added] = queue.add([
      {
        kind: 'whisper',
        title: `Transcribe ${w.source === 'mic' ? 'microphone' : baseName(w.file)}`,
        program: app.autoEditor!.path,
        args,
        cwd: w.source === 'file' ? dirName(w.file) : app.prefs.defaultOutputDir || app.videosDir,
        output: outputPath || undefined,
      },
    ]);
    lastJob = added;
  }

  function cutBySpeech(mode: 'keep' | 'drop-word') {
    if (!app.inputs.some((i) => i.value === w.file)) app.addFiles([w.file]);
    if (mode === 'keep') {
      app.settings.edit = { mode: 'builder', combine: 'or', methods: [method('subtitle')], raw: '' };
    } else {
      app.settings.edit = { mode: 'builder', combine: 'and', methods: [method('audio'), method('word', { value: 'um' }, true)], raw: '' };
    }
    app.tab = 'edit';
    app.notify(mode === 'keep' ? 'Detection set to "subtitles" — sections with speech are kept.' : 'Detection set to cut a filler word — change the word in Detect & pace.', 'success');
  }

  async function saveTranscript() {
    const path = await save({ filters: [{ name: 'Text', extensions: [w.format === 'text' ? 'txt' : w.format] }] });
    if (path) await writeText(path, transcript);
  }
</script>

<div class="tab">
  <section class="card form">
    <h2>Transcribe speech</h2>
    <p class="small muted">Turn speech into subtitles or text with Whisper or Parakeet (runs locally). Subtitles saved next to a video let you cut by what's said.</p>

    <Field label="Source">
      <Segmented bind:value={w.source} options={[{ value: 'file', label: 'File' }, { value: 'mic', label: 'Microphone (live)' }]} />
    </Field>
    {#if w.source === 'file'}
      <Field label="Media file" help="Only the first audio track is used.">
        <PathInput bind:value={w.file} filters={[{ name: 'Media', extensions: MEDIA_EXTENSIONS }]} placeholder="Choose a video or audio file" />
      </Field>
      {#if fileInputs.length > 1}
        <div class="row wrap tiny">
          <span class="faint">From inputs:</span>
          {#each fileInputs as f (f.id)}<button class="btn ghost small" onclick={() => (w.file = f.value)}>{baseName(f.value)}</button>{/each}
        </div>
      {/if}
    {:else}
      <p class="tiny faint">Transcribes the microphone until you press Stop. It doesn't keep a recording — use “Record mic” on the Edit tab for that.</p>
    {/if}

    <Field label="Model" help="Bigger models are more accurate but slower. Parakeet is the most accurate for English and 24 other European languages.">
      <select bind:value={w.model}>
        {#if !models.length}<option value="">No models yet</option>{/if}
        {#each models as m (m.path)}<option value={m.path}>{m.name}</option>{/each}
        {#if w.model && !models.some((m) => m.path === w.model)}<option value={w.model}>{baseName(w.model)}</option>{/if}
      </select>
      <button class="btn" onclick={() => (app.tab = 'settings')}><Download size={14} /> Get models</button>
    </Field>

    <div class="grid2">
      <Field label="Language" help={isParakeet ? 'Parakeet detects the language automatically.' : 'Spoken language. Auto-detect works well for most recordings.'}>
        <select bind:value={w.language} disabled={isParakeet}>
          {#each LANGUAGES as [code, name] (code)}<option value={code}>{name}</option>{/each}
        </select>
      </Field>
      <Field label="Format">
        <Segmented bind:value={w.format} options={[{ value: 'srt', label: 'Subtitles (.srt)' }, { value: 'text', label: 'Text' }, { value: 'json', label: 'JSON' }]} />
      </Field>
    </div>

    <Field label="Save to">
      <Segmented
        bind:value={w.destination}
        options={[
          { value: 'sidecar', label: w.source === 'mic' ? 'Recordings folder' : 'Next to the video', title: 'Same name as the video, so auto-editor picks the subtitles up automatically' },
          { value: 'custom', label: 'Choose file…' },
          { value: 'screen', label: 'Show here only' },
        ]}
      />
    </Field>
    {#if w.destination === 'custom'}
      <PathInput bind:value={w.customOutput} mode="save" filters={[{ name: w.format.toUpperCase(), extensions: [w.format === 'text' ? 'txt' : w.format] }]} />
    {:else if outputPath}
      <p class="tiny faint">→ <code>{outputPath}</code></p>
    {/if}

    <details>
      <summary class="small">More options</summary>
      <div class="col more">
        <div class="row wrap" style="gap: 18px">
          <Toggle bind:checked={w.translate} disabled={isParakeet} label="Translate to English" help="--translate (Whisper only)." />
          <Toggle bind:checked={w.splitWords} label="One word per subtitle" help="--split-words: finer timing, good for cutting single words." />
          <Toggle bind:checked={w.debug} label="Debug output" />
        </div>
        <Field label="Vocabulary hint" help="--prompt: names, jargon or spellings to bias recognition (Whisper only).">
          <input type="text" bind:value={w.prompt} disabled={isParakeet} placeholder="e.g. auto-editor, Kdenlive, WyattBlue" />
        </Field>
        <div class="grid3">
          <Field label="CPU threads" help="Default 4."><input type="number" min="1" max="64" bind:value={w.threads} placeholder="4" /></Field>
          <Field label="Max segment (s)" help="--queue: longest stretch of audio transcribed at once. Default 30."><input type="number" min="1" max="86400" bind:value={w.queue} placeholder="30" /></Field>
          <Field label="Silence threshold" help="--threshold: audio quieter than this (0–1) is skipped. Default 0.04."><input type="text" bind:value={w.threshold} placeholder="0.04" /></Field>
        </div>
      </div>
    </details>

    <code class="cmd tiny">{commandLine('auto-editor', args)}</code>

    <div class="row">
      {#if problems.length}<span class="small" style="color: var(--warn)">{problems[0]}</span>{/if}
      <span class="spacer"></span>
      {#if job?.status === 'running' && w.source === 'mic'}
        <button class="btn primary large" onclick={() => queue.stop(job!.id)}><Square size={15} /> Stop</button>
      {:else}
        <button class="btn primary large" onclick={start} disabled={problems.length > 0 || job?.status === 'running'}>
          {#if w.source === 'mic'}<Mic size={16} />{:else}<AudioLines size={16} />{/if} Transcribe
        </button>
      {/if}
    </div>
  </section>

  <section class="card result">
    <div class="row">
      <h2>Result</h2>
      <span class="spacer"></span>
      {#if job}<span class="badge {job.status === 'done' ? 'ok' : job.status === 'failed' ? 'danger' : 'accent'}">{job.status}</span>{/if}
    </div>
    {#if !job}
      <div class="empty">The transcript appears here. Progress and messages show in the queue at the bottom.</div>
    {:else}
      {#if job.error}<div class="notice danger small">{job.error}</div>{/if}
      {#if transcript}
        <textarea readonly rows="14" class="mono">{transcript}</textarea>
        <div class="row">
          <button class="btn small" onclick={() => { navigator.clipboard.writeText(transcript); app.notify('Copied', 'success'); }}><Copy size={13} /> Copy</button>
          <button class="btn small" onclick={saveTranscript}><FileText size={13} /> Save as…</button>
        </div>
      {:else if job.status === 'done' && job.output}
        <div class="notice ok small">Saved to <code>{job.output}</code></div>
        <div class="row wrap">
          <button class="btn small" onclick={() => openPath(job!.output!)}><FileText size={13} /> Open</button>
          {#if w.source === 'file' && w.format === 'srt' && w.destination === 'sidecar'}
            <button class="btn small" onclick={() => cutBySpeech('keep')}><Scissors size={13} /> Keep only speech</button>
            <button class="btn small" onclick={() => cutBySpeech('drop-word')}><Scissors size={13} /> Cut a filler word…</button>
          {/if}
        </div>
      {:else if job.status === 'running' || job.status === 'queued'}
        <div class="empty">Transcribing… {job.output ? 'The result will be saved to the file.' : ''}</div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .tab {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    max-width: 1300px;
    margin: 0 auto;
  }
  .form,
  .result {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  details summary {
    cursor: pointer;
    color: var(--text-2);
    font-weight: 600;
  }
  .more {
    margin-top: 10px;
    gap: 12px;
  }
  .cmd {
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    color: var(--text-2);
    word-break: break-all;
    user-select: text;
  }
  textarea {
    width: 100%;
    font-size: 12.5px;
  }
</style>
