<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { Download, FolderOpen, Scissors, X } from '@lucide/svelte';
  import { errorText } from '$lib/backend';
  import EditTab from '$lib/components/edit/EditTab.svelte';
  import JobsDrawer from '$lib/components/JobsDrawer.svelte';
  import SettingsTab from '$lib/components/settings/SettingsTab.svelte';
  import ToolsTab from '$lib/components/tools/ToolsTab.svelte';
  import TranscribeTab from '$lib/components/tools/TranscribeTab.svelte';
  import { percent, queue } from '$lib/jobs.svelte';
  import { app, type Tab } from '$lib/state.svelte';
  import { downloads, installTool } from '$lib/tools.svelte';
  import { formatBytes } from '$lib/backend';

  let ready = $state(false);
  let loadError = $state('');
  let dragging = $state(false);

  onMount(() => {
    let unlisten: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    (async () => {
      // Closing kills running jobs (a recording would be lost) and must not
      // drop a settings save that is still waiting on its debounce.
      unlistenClose = await getCurrentWindow().onCloseRequested(async (e) => {
        const running = queue.active;
        if (running) {
          const what = running.kind === 'record' ? 'A recording is in progress and will be lost' : `"${running.title}" is still running and will be stopped`;
          const quit = await ask(`${what}${queue.pending > 1 ? `, and ${queue.pending - 1} queued job(s) won't run` : ''}. Quit anyway?`, {
            title: 'Auto-Editor GUI',
            kind: 'warning',
            okLabel: 'Quit',
            cancelLabel: 'Keep running',
          }).catch(() => true);
          if (!quit) {
            e.preventDefault();
            return;
          }
        }
        await app.flushSave();
      });
      try {
        await Promise.all([queue.init(), downloads.init()]);
        await app.load();
        ready = true;
      } catch (e) {
        loadError = errorText(e);
      }
      unlisten = await getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === 'enter' || p.type === 'over') dragging = true;
        else if (p.type === 'leave') dragging = false;
        else if (p.type === 'drop') {
          dragging = false;
          if (!p.paths.length) return;
          if (app.tab === 'transcribe') app.whisper.file = p.paths[0];
          else {
            app.addFiles(p.paths);
            app.tab = 'edit';
          }
        }
      });
    })();
    return () => {
      unlisten?.();
      unlistenClose?.();
    };
  });

  // Persist settings whenever they change.
  $effect(() => {
    JSON.stringify([app.prefs, app.settings, app.whisper, app.userPresets]);
    app.scheduleSave();
  });

  // Theme
  $effect(() => {
    const t = app.prefs.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  });

  // Progress in the window title, so it shows in the taskbar.
  $effect(() => {
    const a = queue.active;
    const p = a ? percent(a) : null;
    const title = a ? `${p !== null ? `${p.toFixed(0)}% · ` : ''}${a.title} — Auto-Editor GUI` : 'Auto-Editor GUI';
    getCurrentWindow().setTitle(title).catch(() => {});
  });

  const TABS: { id: Tab; label: string }[] = [
    { id: 'edit', label: 'Edit' },
    { id: 'transcribe', label: 'Transcribe' },
    { id: 'tools', label: 'Tools' },
    { id: 'settings', label: 'Settings' },
  ];

  let installing = $derived(!!downloads.active['auto-editor']);
  let aeDl = $derived(downloads.active['auto-editor']);

  async function quickInstall() {
    try {
      await installTool('auto-editor');
      app.notify('auto-editor is ready', 'success');
    } catch (e) {
      app.notify(`Download failed: ${errorText(e)}`, 'error');
    }
  }
</script>

<div class="app">
  <header class="top">
    <div class="brand">
      <span class="logo"><Scissors size={16} strokeWidth={2.4} /></span>
      <span class="name">Auto-Editor <span class="faint">GUI</span></span>
    </div>
    <nav>
      {#each TABS as t (t.id)}
        <button class:active={app.tab === t.id} onclick={() => (app.tab = t.id)}>
          {t.label}
          {#if t.id === 'settings' && app.toolsChecked && !app.autoEditor}<span class="dot"></span>{/if}
        </button>
      {/each}
    </nav>
    <div class="status tiny">
      {#if app.autoEditor}
        <span class="faint" data-tip={app.autoEditor.path}>auto-editor {app.autoEditor.version ?? ''}</span>
      {:else if app.toolsChecked}
        <span style="color: var(--warn)">auto-editor not set up</span>
      {/if}
    </div>
  </header>

  <main>
    {#if loadError}
      <div class="notice danger">Couldn't start: {loadError}</div>
    {:else if !ready}
      <div class="empty">Loading…</div>
    {:else}
      {#if app.toolsChecked && !app.autoEditor && app.tab !== 'settings'}
        <div class="setup card">
          <div class="grow">
            <strong>auto-editor isn't set up yet</strong>
            <p class="small muted">This app drives the auto-editor program. Download it once (about 45 MB, FFmpeg included) into the app's folder, or point to a copy you already have.</p>
            {#if aeDl}
              {@const p = aeDl.total ? (aeDl.received / aeDl.total) * 100 : null}
              <div class="row" style="margin-top: 8px">
                <div class="progress grow" class:indeterminate={p === null}><div style:width="{p ?? 0}%"></div></div>
                <span class="tiny muted">{formatBytes(aeDl.received)}{aeDl.total ? ` / ${formatBytes(aeDl.total)}` : ''}</span>
              </div>
            {/if}
          </div>
          <button class="btn primary" onclick={quickInstall} disabled={installing}><Download size={15} /> Download auto-editor</button>
          <button class="btn" onclick={() => (app.tab = 'settings')}><FolderOpen size={15} /> I have it already</button>
        </div>
      {/if}

      <div class="page" class:fill={app.tab === 'edit'}>
        {#if app.tab === 'edit'}<EditTab />
        {:else if app.tab === 'transcribe'}<TranscribeTab />
        {:else if app.tab === 'tools'}<ToolsTab />
        {:else}<SettingsTab />{/if}
      </div>
    {/if}
  </main>

  <div class="drawer"><JobsDrawer /></div>

  {#if dragging}
    <div class="dropzone">
      <div class="card">Drop to {app.tab === 'transcribe' ? 'transcribe' : 'add to inputs'}</div>
    </div>
  {/if}

  {#if app.toast}
    <div class="toast {app.toast.kind}" role="status">
      <span>{app.toast.text}</span>
      <button class="btn ghost icon small" aria-label="Dismiss" onclick={() => (app.toast = null)}><X size={14} /></button>
    </div>
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 20px;
    height: 48px;
    padding: 0 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    flex: none;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 15px;
  }
  .logo {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    background: var(--accent);
    color: var(--accent-text);
  }
  nav {
    display: flex;
    gap: 2px;
    height: 100%;
  }
  nav button {
    position: relative;
    border: 0;
    background: transparent;
    padding: 0 14px;
    font-weight: 500;
    color: var(--text-2);
    border-bottom: 2px solid transparent;
  }
  nav button:hover {
    color: var(--text);
  }
  nav button.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .dot {
    position: absolute;
    top: 12px;
    right: 6px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--warn);
  }
  .status {
    margin-left: auto;
  }
  main {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }
  .page {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .page.fill {
    overflow: hidden;
  }
  .setup {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-color: var(--warn);
    background: var(--warn-soft);
    flex: none;
  }
  .drawer {
    flex: none;
    padding: 0 12px;
  }
  .dropzone {
    position: fixed;
    inset: 0;
    z-index: 600;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 3px dashed var(--accent);
    pointer-events: none;
  }
  .dropzone .card {
    padding: 18px 26px;
    font-size: 16px;
    font-weight: 600;
  }
  .toast {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 700;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 480px;
    padding: 10px 10px 10px 14px;
    border-radius: var(--radius);
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    box-shadow: var(--shadow-lg);
    font-size: 13px;
  }
  .toast.error {
    border-left-color: var(--danger);
  }
  .toast.success {
    border-left-color: var(--ok);
  }
</style>
