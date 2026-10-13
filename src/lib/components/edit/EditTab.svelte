<script lang="ts">
  import { Copy, Play, TriangleAlert, Wrench } from '@lucide/svelte';
  import { commandLine, renderArgs, outputPathFor } from '$lib/args';
  import { queue } from '$lib/jobs.svelte';
  import { planJobs } from '$lib/run';
  import { app } from '$lib/state.svelte';
  import ActionsPanel from './ActionsPanel.svelte';
  import DetectPanel from './DetectPanel.svelte';
  import EncodingPanel from './EncodingPanel.svelte';
  import InputList from './InputList.svelte';
  import MorePanel from './MorePanel.svelte';
  import OutputPanel from './OutputPanel.svelte';
  import PreviewPanel from './PreviewPanel.svelte';
  import QuickSettings from './QuickSettings.svelte';
  import RangesPanel from './RangesPanel.svelte';

  const TABS = [
    { id: 'preview', label: 'Preview' },
    { id: 'detect', label: 'Detect & pace' },
    { id: 'actions', label: 'Actions' },
    { id: 'ranges', label: 'Manual edits' },
    { id: 'output', label: 'Output' },
    { id: 'encoding', label: 'Encoding' },
    { id: 'more', label: 'More' },
  ] as const;
  let tab = $state<(typeof TABS)[number]['id']>('preview');

  // Shown for the first input (or a placeholder) so you can see what runs.
  let command = $derived.by(() => {
    const s = app.settings;
    const combine = app.prefs.batchMode === 'combine' && app.inputs.length > 1;
    const inputs = app.inputs.length ? (combine ? app.inputs : [app.inputs[0]]) : [{ id: 'x', kind: 'file' as const, value: 'input.mp4' }];
    const out = outputPathFor(s, inputs[0], app.prefs.defaultOutputDir || app.videosDir);
    return commandLine('auto-editor', renderArgs(s, inputs.map((i) => i.value), out, { ytdlpPath: app.ytdlp?.path }));
  });

  let plan = $derived(planJobs());

  function start() {
    const p = planJobs();
    if (p.errors.length) {
      app.notify(p.errors[0], 'error');
      return;
    }
    queue.add(p.jobs);
  }

  function copy() {
    navigator.clipboard.writeText(command);
    app.notify('Command copied', 'success');
  }

  let startLabel = $derived.by(() => {
    if (app.inputs.some((i) => i.kind === 'mic')) return app.inputs.length === 1 ? 'Start recording' : `Start (${plan.jobs.length})`;
    const n = plan.jobs.length;
    const verb = app.settings.exportKind === 'default' || app.settings.exportKind === 'clip-sequence' ? 'Render' : 'Export';
    return n > 1 ? `${verb} ${n} files` : verb;
  });
</script>

<div class="edit">
  <aside class="left">
    <div class="scroll">
      <InputList />
      <QuickSettings onAdvanced={(t) => (tab = t as typeof tab)} />
    </div>
  </aside>

  <section class="right card">
    <nav class="tabs">
      {#each TABS as t (t.id)}
        <button class:active={tab === t.id} onclick={() => (tab = t.id)}>{t.label}</button>
      {/each}
    </nav>
    <div class="content">
      {#if tab === 'preview'}<PreviewPanel />
      {:else if tab === 'detect'}<DetectPanel />
      {:else if tab === 'actions'}<ActionsPanel />
      {:else if tab === 'ranges'}<RangesPanel />
      {:else if tab === 'output'}<OutputPanel />
      {:else if tab === 'encoding'}<EncodingPanel />
      {:else}<MorePanel />{/if}
    </div>
  </section>

  <footer class="runbar card">
    <div class="cmd">
      <code title={command}>{command}</code>
      <button class="btn ghost icon small" aria-label="Copy command" data-tip="Copy the command line (license key is passed separately and not included)" onclick={copy}><Copy size={14} /></button>
    </div>
    {#if plan.warnings.length && !plan.errors.length}
      <span class="warn small" data-tip={plan.warnings.join('\n')}><TriangleAlert size={14} /> {plan.warnings.length}</span>
    {/if}
    {#if !app.autoEditor && app.toolsChecked}
      <button class="btn" onclick={() => (app.tab = 'settings')}><Wrench size={15} /> Set up auto-editor</button>
    {:else}
      <button class="btn primary large" onclick={start} disabled={plan.errors.length > 0} data-tip={plan.errors.join('\n') || null}>
        <Play size={16} /> {startLabel}
      </button>
    {/if}
  </footer>
</div>

<style>
  .edit {
    display: grid;
    grid-template-columns: minmax(330px, 400px) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 12px;
    height: 100%;
    min-height: 0;
  }
  .left {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .scroll {
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-right: 2px;
    padding-bottom: 2px;
  }
  .right {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 6px 8px 0;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    flex: none;
  }
  .tabs button {
    border: 0;
    background: transparent;
    padding: 8px 12px;
    font-weight: 500;
    color: var(--text-2);
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    white-space: nowrap;
  }
  .tabs button:hover {
    color: var(--text);
  }
  .tabs button.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }
  .content {
    flex: 1;
    overflow: auto;
    padding: 16px;
    min-height: 0;
  }
  .runbar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 8px 8px 12px;
  }
  .cmd {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cmd code {
    flex: 1;
    min-width: 0;
    max-height: 3.2em;
    overflow: auto;
    color: var(--text-2);
    font-size: 12px;
    line-height: 1.6;
    word-break: break-all;
    user-select: text;
  }
  .warn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--warn);
    font-weight: 600;
  }
</style>
