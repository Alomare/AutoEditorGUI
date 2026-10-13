<script lang="ts">
  import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
  import { ChevronDown, ChevronUp, CircleCheck, CircleX, Clock, FolderOpen, Play, RotateCcw, Square, Trash2, Ban, Copy, Mic } from '@lucide/svelte';
  import { formatDuration } from '$lib/backend';
  import { percent, queue, type Job } from '$lib/jobs.svelte';
  import { commandLine } from '$lib/args';
  import { app } from '$lib/state.svelte';

  let expanded = $state(false);
  let selectedId = $state<string | null>(null);

  let selected = $derived(queue.jobs.find((j) => j.id === selectedId) ?? queue.active ?? queue.jobs.at(-1));
  let summary = $derived(queue.active ?? queue.jobs.at(-1));

  // Open automatically when something starts; follow the running job.
  let lastActive = '';
  $effect(() => {
    const a = queue.active;
    if (a && a.id !== lastActive) {
      lastActive = a.id;
      selectedId = a.id;
      expanded = true;
    }
  });

  let logEl = $state<HTMLElement>();
  $effect(() => {
    void selected?.log.length;
    if (logEl) logEl.scrollTop = logEl.scrollHeight;
  });

  function elapsed(j: Job): string {
    if (!j.startedAt) return '';
    return formatDuration(((j.endedAt ?? now) - j.startedAt) / 1000);
  }

  function eta(j: Job): string {
    const e = j.progress?.eta;
    return e && e > 0 && j.status === 'running' ? `~${formatDuration(e)} left` : '';
  }

  async function reveal(j: Job) {
    try {
      if (j.output && j.kind !== 'download') await revealItemInDir(j.output);
      else if (j.cwd) await openPath(j.cwd);
    } catch {
      if (j.cwd) await openPath(j.cwd).catch(() => app.notify('Could not open the folder', 'error'));
    }
  }

  async function openOutput(j: Job) {
    if (!j.output) return;
    await openPath(j.output).catch(() => reveal(j));
  }

  function copyCommand(j: Job) {
    const args = j.args.filter((a, i, all) => !(a === '--progress' || all[i - 1] === '--progress'));
    navigator.clipboard.writeText(commandLine('auto-editor', args));
    app.notify('Command copied', 'success');
  }

  // Ticks the elapsed time while something runs.
  let now = $state(Date.now());
  $effect(() => {
    if (!queue.active) return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
</script>

{#if queue.jobs.length}
  <section class="drawer card" class:expanded>
    <button class="bar" onclick={() => (expanded = !expanded)}>
      {#if summary}
        {@const p = percent(summary)}
        <span class="status {summary.status}">
          {#if summary.status === 'running'}<Play size={13} />{:else if summary.status === 'done'}<CircleCheck size={14} />{:else if summary.status === 'failed'}<CircleX size={14} />{:else if summary.status === 'cancelled'}<Ban size={14} />{:else}<Clock size={14} />{/if}
        </span>
        <span class="ellipsis title">{summary.title}</span>
        {#if summary.status === 'running'}
          <div class="progress grow" class:indeterminate={p === null}><div style:width="{p ?? 0}%"></div></div>
          <span class="tiny muted nowrap">{p !== null ? `${p.toFixed(0)}%` : ''} {eta(summary)}</span>
        {:else}
          <span class="spacer"></span>
        {/if}
        {#if queue.pending > 1}<span class="badge">{queue.pending - 1} queued</span>{/if}
      {/if}
      {#if expanded}<ChevronDown size={16} />{:else}<ChevronUp size={16} />{/if}
    </button>

    {#if expanded}
      <div class="body">
        <ul class="list">
          {#each queue.jobs as j (j.id)}
            {@const p = percent(j)}
            <li class:sel={selected?.id === j.id}>
              <button class="item" onclick={() => (selectedId = j.id)}>
                <span class="status {j.status}">
                  {#if j.status === 'running'}{#if j.kind === 'record'}<Mic size={13} />{:else}<Play size={13} />{/if}{:else if j.status === 'done'}<CircleCheck size={14} />{:else if j.status === 'failed'}<CircleX size={14} />{:else if j.status === 'cancelled'}<Ban size={14} />{:else}<Clock size={14} />{/if}
                </span>
                <span class="grow">
                  <span class="ellipsis block small">{j.title}</span>
                  {#if j.status === 'running'}
                    <span class="progress" class:indeterminate={p === null}><span style:width="{p ?? 0}%"></span></span>
                  {:else}
                    <span class="tiny faint">{j.status}{j.startedAt ? ` · ${elapsed(j)}` : ''}</span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
          <li class="list-actions">
            <button class="btn ghost small" onclick={() => queue.clearFinished()}><Trash2 size={13} /> Clear finished</button>
          </li>
        </ul>

        {#if selected}
          <div class="detail">
            <div class="row">
              <strong class="ellipsis grow">{selected.title}</strong>
              {#if selected.status === 'running'}
                <span class="tiny muted">{elapsed(selected)} {eta(selected)}</span>
                {#if selected.kind === 'record' || (selected.kind === 'whisper' && selected.args.includes(':mic'))}
                  <button class="btn primary small" onclick={() => queue.stop(selected!.id)}><Square size={12} /> Stop recording</button>
                  <button class="btn danger small" onclick={() => queue.kill(selected!.id)} data-tip="Discard: kill without finishing">Discard</button>
                {:else}
                  <button class="btn danger small" onclick={() => queue.stop(selected!.id)}><Square size={12} /> Cancel</button>
                {/if}
              {:else if selected.status === 'queued'}
                <button class="btn small" onclick={() => queue.stop(selected!.id)}>Remove from queue</button>
              {:else}
                {#if selected.status === 'done' && selected.output}
                  <button class="btn primary small" onclick={() => openOutput(selected!)}><Play size={12} /> Open</button>
                {/if}
                {#if selected.output || selected.cwd}
                  <button class="btn small" onclick={() => reveal(selected!)}><FolderOpen size={13} /> Show in folder</button>
                {/if}
                <button class="btn small" onclick={() => queue.retry(selected!.id)}><RotateCcw size={13} /> Run again</button>
              {/if}
              <button class="btn ghost icon small" aria-label="Copy command" data-tip="Copy this command" onclick={() => copyCommand(selected!)}><Copy size={13} /></button>
            </div>
            {#if selected.error}<div class="notice danger small">{selected.error}</div>{/if}
            {#if selected.status === 'done' && selected.output}<div class="tiny faint ellipsis" title={selected.output}>Saved to {selected.output}</div>{/if}
            <pre class="log" bind:this={logEl}>{selected.log.join('\n')}{selected.stdout.length ? '\n' + selected.stdout.join('\n') : ''}</pre>
          </div>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .drawer {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin-bottom: 12px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 38px;
    padding: 0 12px;
    border: 0;
    background: transparent;
    text-align: left;
  }
  .bar:hover {
    background: var(--surface-2);
  }
  .title {
    max-width: 40%;
    font-weight: 500;
  }
  .nowrap {
    white-space: nowrap;
  }
  .status {
    display: inline-flex;
    color: var(--text-3);
  }
  .status.running {
    color: var(--accent);
  }
  .status.done {
    color: var(--ok);
  }
  .status.failed {
    color: var(--danger);
  }
  .body {
    display: grid;
    grid-template-columns: 240px 1fr;
    height: 190px;
    border-top: 1px solid var(--border);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
    overflow: auto;
    border-right: 1px solid var(--border);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
  }
  .item:hover {
    background: var(--surface-2);
  }
  li.sel .item {
    background: var(--accent-soft);
  }
  .block {
    display: block;
  }
  .item .progress {
    display: block;
    margin-top: 5px;
  }
  .item .progress > span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .list-actions {
    padding: 6px 2px;
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    min-width: 0;
    min-height: 0;
  }
  .log {
    flex: 1;
    margin: 0;
    padding: 8px 10px;
    overflow: auto;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    font: 12px/1.5 var(--mono);
    white-space: pre-wrap;
    word-break: break-word;
    user-select: text;
  }
</style>
