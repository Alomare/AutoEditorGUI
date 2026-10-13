<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { FilePlus2, Link, Mic, X, Film, Music, FileCode, Globe, Info, RefreshCw } from '@lucide/svelte';
  import { MEDIA_EXTENSIONS, TIMELINE_EXTENSIONS } from '$lib/catalog';
  import { formatDuration, formatFps } from '$lib/backend';
  import { extOf, inputLabel, type InputItem } from '$lib/model';
  import { app } from '$lib/state.svelte';
  import Modal from '../ui/Modal.svelte';
  import Segmented from '../ui/Segmented.svelte';

  let urlOpen = $state(false);
  let url = $state('');

  async function addFiles() {
    const picked = await open({
      multiple: true,
      filters: [
        { name: 'Media', extensions: MEDIA_EXTENSIONS },
        { name: 'Timelines (v1/v2/v3, FCP7 XML)', extensions: TIMELINE_EXTENSIONS },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (Array.isArray(picked)) app.addFiles(picked);
    else if (typeof picked === 'string') app.addFiles([picked]);
  }

  function submitUrl() {
    if (!/^https?:\/\//i.test(url.trim())) return;
    app.addUrl(url);
    url = '';
    urlOpen = false;
  }

  function summary(item: InputItem): string {
    if (item.kind === 'mic') return 'Records until you press Stop, then edits the recording';
    if (item.kind === 'url') return app.ytdlp ? 'Downloaded with yt-dlp' : 'Needs yt-dlp (Settings → Tools)';
    if (TIMELINE_EXTENSIONS.includes(extOf(item.value))) return 'Timeline — renders as edited';
    const info = app.mediaInfo[item.value];
    if (info === undefined) return 'Reading…';
    if (info === null) return "Couldn't read media info";
    const parts: string[] = [formatDuration(info.container?.duration ?? 0)];
    const v = info.video?.[0];
    if (v) parts.push(`${v.resolution[0]}×${v.resolution[1]}`, `${formatFps(v.fps)} fps`, v.codec);
    const a = info.audio ?? [];
    if (a.length) parts.push(a.length > 1 ? `${a.length} audio tracks` : `${a[0].codec} ${a[0].layout}`);
    if (info.subtitle?.length) parts.push(`${info.subtitle.length} subtitle`);
    return parts.join(' · ');
  }

  function icon(item: InputItem) {
    if (item.kind === 'mic') return Mic;
    if (item.kind === 'url') return Globe;
    const ext = extOf(item.value);
    if (TIMELINE_EXTENSIONS.includes(ext)) return FileCode;
    if (['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'mka'].includes(ext)) return Music;
    return Film;
  }

  let fileCount = $derived(app.inputs.length);
</script>

<section class="card inputs">
  <header>
    <h2>Inputs</h2>
    {#if fileCount}<span class="badge">{fileCount}</span>{/if}
    <span class="spacer"></span>
    {#if fileCount}<button class="btn ghost small" onclick={() => (app.inputs = [])}>Clear</button>{/if}
  </header>

  {#if fileCount === 0}
    <button class="drop" onclick={addFiles}>
      <FilePlus2 size={26} strokeWidth={1.6} />
      <strong>Drop videos or audio here</strong>
      <span class="small faint">or click to browse — timelines (.v3, .xml) work too</span>
    </button>
  {:else}
    <ul>
      {#each app.inputs as item (item.id)}
        {@const Icon = icon(item)}
        <li>
          <span class="ico"><Icon size={16} /></span>
          <div class="grow">
            <div class="ellipsis name" title={item.value}>{inputLabel(item)}</div>
            <div class="ellipsis tiny faint">{summary(item)}</div>
          </div>
          {#if item.kind === 'file' && app.mediaInfo[item.value] === null}
            <button class="btn ghost icon small" aria-label="Retry reading info" data-tip="Retry reading media info" onclick={() => app.loadInfo(item.value, true)}><RefreshCw size={13} /></button>
          {/if}
          <button class="btn ghost icon small" aria-label="Remove" onclick={() => app.removeInput(item.id)}><X size={14} /></button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="row wrap actions">
    <button class="btn small" onclick={addFiles}><FilePlus2 size={14} /> Add files</button>
    <button class="btn small" onclick={() => (urlOpen = true)}><Link size={14} /> Add URL</button>
    <button class="btn small" onclick={() => app.addMic()} disabled={app.inputs.some((i) => i.kind === 'mic')}><Mic size={14} /> Record mic</button>
  </div>

  {#if fileCount > 1}
    <div class="row small batch">
      <Segmented
        small
        bind:value={app.prefs.batchMode}
        options={[
          { value: 'separate', label: 'Edit each separately', title: 'One job and one output per input' },
          { value: 'combine', label: 'Combine into one', title: 'All inputs go into one timeline (exports with multiple sources need a license key)' },
        ]}
      />
      <span data-tip={app.prefs.batchMode === 'separate' ? 'Each input becomes its own job with its own output.' : 'All inputs are joined into a single timeline, in this order.'}><Info size={13} class="faint" /></span>
    </div>
  {/if}
</section>

<Modal bind:open={urlOpen} title="Add a video URL">
  <p class="small muted">Anything yt-dlp supports (YouTube, Vimeo, Twitch VODs…). The download is edited like a local file.</p>
  <input type="text" bind:value={url} placeholder="https://…" onkeydown={(e) => e.key === 'Enter' && submitUrl()} />
  {#if !app.ytdlp}
    <div class="notice warn small">yt-dlp isn't set up yet. Get it in Settings → Tools (one click).</div>
  {/if}
  {#snippet footer()}
    <button class="btn" onclick={() => (urlOpen = false)}>Cancel</button>
    <button class="btn primary" onclick={submitUrl} disabled={!/^https?:\/\//i.test(url.trim())}>Add</button>
  {/snippet}
</Modal>

<style>
  .inputs {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 22px 12px;
    border: 1.5px dashed var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface-2);
    color: var(--text-2);
  }
  .drop:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 220px;
    overflow: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: 1px solid var(--border);
  }
  .ico {
    color: var(--text-3);
    display: inline-flex;
  }
  .name {
    font-weight: 500;
  }
  .batch {
    gap: 6px;
  }
</style>
