<script lang="ts">
  import { openPath, openUrl } from '@tauri-apps/plugin-opener';
  import { Download, RefreshCw, FolderOpen, Trash2, Eye, EyeOff, CircleCheck, CircleAlert, X } from '@lucide/svelte';
  import { errorText, formatBytes, listFiles, removeFile, type FileEntry } from '$lib/backend';
  import { MODELS } from '$lib/catalog';
  import { queue } from '$lib/jobs.svelte';
  import { joinPath } from '$lib/model';
  import { app } from '$lib/state.svelte';
  import { checkUpdate, downloads, installTool, type UpdateInfo } from '$lib/tools.svelte';
  import Field from '../ui/Field.svelte';
  import PathInput from '../ui/PathInput.svelte';
  import Segmented from '../ui/Segmented.svelte';

  type Tool = 'auto-editor' | 'yt-dlp';
  let updates = $state<Partial<Record<Tool, UpdateInfo | string>>>({});
  let checking = $state<Partial<Record<Tool, boolean>>>({});

  async function check(tool: Tool) {
    checking[tool] = true;
    try {
      updates[tool] = await checkUpdate(tool);
    } catch (e) {
      updates[tool] = errorText(e);
    } finally {
      checking[tool] = false;
    }
  }

  async function install(tool: Tool) {
    if (tool === 'auto-editor' && queue.active) {
      app.notify('Wait for the running job to finish before updating auto-editor.', 'error');
      return;
    }
    try {
      const u = updates[tool];
      await installTool(tool, typeof u === 'object' ? u : undefined);
      updates[tool] = undefined;
      app.notify(`${tool} is ready`, 'success');
    } catch (e) {
      app.notify(`Download failed: ${errorText(e)}`, 'error');
    }
  }

  async function setCustom(tool: Tool, path: string) {
    if (tool === 'auto-editor') app.prefs.autoEditorPath = path;
    else app.prefs.ytdlpPath = path;
    await app.refreshTools();
  }

  // --- Models ----------------------------------------------------------------
  let installed = $state<FileEntry[]>([]);
  async function loadModels() {
    if (app.info) installed = await listFiles(app.info.paths.models, ['bin']);
  }
  $effect(() => {
    void app.info;
    loadModels();
  });

  async function getModel(file: string, url: string) {
    try {
      await downloads.run(`model:${file}`, file, url, joinPath(app.info!.paths.models, file));
      await loadModels();
      if (!app.whisper.model) app.whisper.model = joinPath(app.info!.paths.models, file);
    } catch (e) {
      app.notify(`Download failed: ${errorText(e)}`, 'error');
    }
  }

  async function deleteModel(f: FileEntry) {
    await removeFile(f.path);
    if (app.whisper.model === f.path) app.whisper.model = '';
    await loadModels();
  }

  let showKey = $state(false);

  function pct(id: string): number | null {
    const d = downloads.active[id];
    return d && d.total ? (d.received / d.total) * 100 : null;
  }
</script>

{#snippet toolCard(tool: Tool, title: string, desc: string)}
  {@const info = tool === 'auto-editor' ? app.autoEditor : app.ytdlp}
  {@const u = updates[tool]}
  {@const dl = downloads.active[tool]}
  <div class="tool card">
    <div class="row">
      <span class="ico" class:ok={!!info}>{#if info}<CircleCheck size={18} />{:else}<CircleAlert size={18} />{/if}</span>
      <div class="grow">
        <div class="row"><strong>{title}</strong>{#if info?.version}<span class="badge">{info.version}</span>{/if}{#if info}<span class="badge {info.source === 'bundled' ? 'accent' : ''}">{info.source === 'bundled' ? 'in app folder' : info.source === 'path' ? 'from PATH' : 'custom'}</span>{/if}</div>
        <div class="tiny faint ellipsis" title={info?.path ?? ''}>{info ? info.path : desc}</div>
      </div>
      <button class="btn small" onclick={() => check(tool)} disabled={checking[tool] || !!dl}><RefreshCw size={13} class={checking[tool] ? 'spin' : ''} /> Check for updates</button>
      {#if !info || (typeof u === 'object' && u.newer)}
        <button class="btn primary small" onclick={() => install(tool)} disabled={!!dl}>
          <Download size={13} /> {typeof u === 'object' ? `Get ${u.latest} (${formatBytes(u.size)})` : 'Download'}
        </button>
      {/if}
    </div>
    {#if dl}
      {@const p = pct(tool)}
      <div class="row">
        <div class="progress grow" class:indeterminate={p === null}><div style:width="{p ?? 0}%"></div></div>
        <span class="tiny muted">{formatBytes(dl.received)}{dl.total ? ` / ${formatBytes(dl.total)}` : ''}</span>
        <button class="btn ghost icon small" aria-label="Cancel download" onclick={() => downloads.cancel(tool)}><X size={13} /></button>
      </div>
    {:else if typeof u === 'object'}
      <p class="tiny {u.newer ? '' : 'faint'}">{u.newer ? `Version ${u.latest} is available.` : `You have the latest version (${u.latest}).`}</p>
    {:else if typeof u === 'string'}
      <p class="tiny error">{u}</p>
    {:else if downloads.errors[tool]}
      <p class="tiny error">Download failed: {downloads.errors[tool]}</p>
    {/if}
    <Field label="Use a specific file instead" help="Point to another {title} executable. Leave empty to use the one in the app's bin folder (or PATH).">
      <PathInput
        value={tool === 'auto-editor' ? app.prefs.autoEditorPath : app.prefs.ytdlpPath}
        filters={app.info?.os === 'windows' ? [{ name: 'Programs', extensions: ['exe'] }] : []}
        placeholder="Automatic"
        onchange={(v) => setCustom(tool, v)}
      />
    </Field>
  </div>
{/snippet}

<div class="settings">
  <section>
    <h2>Tools</h2>
    {@render toolCard('auto-editor', 'auto-editor', 'Not found — download it (about 45 MB, includes FFmpeg).')}
    {@render toolCard('yt-dlp', 'yt-dlp', 'Optional: lets you edit videos straight from a URL.')}
  </section>

  <section>
    <h2>License key</h2>
    <p class="small muted">
      auto-editor is free. A few features need a license key: the <strong>Add overlay</strong> action and exporting a timeline that combines several inputs.
      Renders larger than 3200×1800 may also need one. Keys come from <a href="https://app.auto-editor.com" onclick={(e) => { e.preventDefault(); openUrl('https://app.auto-editor.com'); }}>app.auto-editor.com</a>.
    </p>
    <div class="row" style="max-width: 560px">
      <input type={showKey ? 'text' : 'password'} bind:value={app.prefs.licenseKey} placeholder="Paste your key" spellcheck="false" autocomplete="off" />
      <button class="btn icon" aria-label={showKey ? 'Hide key' : 'Show key'} onclick={() => (showKey = !showKey)}>{#if showKey}<EyeOff size={15} />{:else}<Eye size={15} />{/if}</button>
    </div>
    <p class="tiny faint">Stored in this app's data folder and passed to auto-editor through the AE_PRIVATE_LK environment variable, so it never appears in command lines.</p>
  </section>

  <section>
    <h2>Transcription models</h2>
    <p class="small muted">Used by the Transcribe tab. Download once; they're saved in <code>{app.info?.paths.models}</code>.</p>
    <div class="models">
      {#each MODELS as m (m.file)}
        {@const have = installed.find((f) => f.name === m.file)}
        {@const id = `model:${m.file}`}
        {@const dl = downloads.active[id]}
        <div class="model">
          <div class="grow">
            <div class="row"><strong class="small">{m.label}</strong>{#if m.note}<span class="tiny faint">{m.note}</span>{/if}</div>
            {#if dl}
              {@const p = pct(id)}
              <div class="row"><div class="progress grow" class:indeterminate={p === null}><div style:width="{p ?? 0}%"></div></div><span class="tiny muted">{formatBytes(dl.received)} / {formatBytes(m.sizeMB * 1048576)}</span></div>
            {:else if downloads.errors[id]}
              <span class="tiny error">Download failed: {downloads.errors[id]}</span>
            {:else}
              <span class="tiny faint">{m.file} · {formatBytes(m.sizeMB * 1048576)}</span>
            {/if}
          </div>
          {#if dl}
            <button class="btn ghost small" onclick={() => downloads.cancel(id)}>Cancel</button>
          {:else if have}
            <span class="badge ok">Installed</span>
            <button class="btn ghost icon small" aria-label="Delete model" onclick={() => deleteModel(have)}><Trash2 size={14} /></button>
          {:else}
            <button class="btn small" onclick={() => getModel(m.file, m.url)}><Download size={13} /> {downloads.errors[id] ? 'Retry' : 'Download'}</button>
          {/if}
        </div>
      {/each}
      {#each installed.filter((f) => !MODELS.some((m) => m.file === f.name)) as f (f.path)}
        <div class="model">
          <div class="grow"><strong class="small">{f.name}</strong> <span class="tiny faint">{formatBytes(f.size)}</span></div>
          <span class="badge ok">Installed</span>
          <button class="btn ghost icon small" aria-label="Delete model" onclick={() => deleteModel(f)}><Trash2 size={14} /></button>
        </div>
      {/each}
    </div>
    <div class="row">
      <button class="btn small" onclick={() => app.info && openPath(app.info.paths.models)}><FolderOpen size={13} /> Open models folder</button>
      <span class="tiny faint">You can also drop any ggml .bin model in that folder.</span>
    </div>
  </section>

  <section>
    <h2>Appearance</h2>
    <Segmented bind:value={app.prefs.theme} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
  </section>

  <section>
    <h2>Storage</h2>
    {#if app.info}
      <p class="small muted">
        {#if app.info.paths.portable}
          Portable mode: everything (tools, settings, presets, models) is kept next to the app in <code>{app.info.paths.root}</code>. Move or copy the folder and it all comes along.
        {:else}
          The app's folder isn't writable, so data is kept in <code>{app.info.paths.root}</code>.
        {/if}
      </p>
      <div class="row wrap">
        <button class="btn small" onclick={() => openPath(app.info!.paths.root)}><FolderOpen size={13} /> Open app folder</button>
        <button class="btn small" onclick={() => openPath(app.info!.paths.data)}><FolderOpen size={13} /> Open settings folder</button>
      </div>
    {/if}
  </section>

  <section>
    <h2>About</h2>
    <p class="small muted">
      Auto-Editor GUI {app.info?.version} — a portable front end for
      <a href="https://github.com/WyattBlue/auto-editor" onclick={(e) => { e.preventDefault(); openUrl('https://github.com/WyattBlue/auto-editor'); }}>auto-editor</a>
      by WyattBlue. Docs: <a href="https://auto-editor.com/ref/options" onclick={(e) => { e.preventDefault(); openUrl('https://auto-editor.com/ref/options'); }}>auto-editor.com</a>.
      MIT licensed.
    </p>
  </section>
</div>

<style>
  .settings {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 28px;
    padding-bottom: 32px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .tool {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ico {
    display: inline-flex;
    color: var(--warn);
  }
  .ico.ok {
    color: var(--ok);
  }
  .error {
    color: var(--danger);
  }
  .models {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    overflow: hidden;
  }
  .model {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }
  .model:last-child {
    border-bottom: 0;
  }
</style>
