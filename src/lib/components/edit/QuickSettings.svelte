<script lang="ts">
  // The handful of settings most people need. These are views over the full
  // settings: anything set in the advanced tabs shows up here as "Custom".
  import { Save, Trash2 } from '@lucide/svelte';
  import { CONTAINERS, EXPORTS, METHOD_MAP } from '$lib/catalog';
  import { method, step, type ActionStep, type EditSpec } from '$lib/model';
  import { app } from '$lib/state.svelte';
  import Field from '../ui/Field.svelte';
  import LengthInput from '../ui/LengthInput.svelte';
  import Modal from '../ui/Modal.svelte';
  import PathInput from '../ui/PathInput.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import ThresholdInput from './ThresholdInput.svelte';

  let { onAdvanced }: { onAdvanced: (tab: string) => void } = $props();

  const s = $derived(app.settings);

  // --- Detection ---------------------------------------------------------
  type Detect = 'audio' | 'motion' | 'both' | 'subtitle' | 'custom';

  function detectOf(e: EditSpec): Detect {
    if (e.mode !== 'builder') return 'custom';
    const kinds = e.methods.map((m) => m.kind + (m.negate ? '!' : '')).join(',');
    if (kinds === 'audio') return 'audio';
    if (kinds === 'motion') return 'motion';
    if (kinds === 'audio,motion' && e.combine === 'or') return 'both';
    if (kinds === 'subtitle') return 'subtitle';
    return 'custom';
  }

  function setDetect(d: Detect) {
    if (d === 'custom') {
      onAdvanced('detect');
      return;
    }
    const keep = (kind: 'audio' | 'motion') => s.edit.methods.find((m) => m.kind === kind && !m.negate) ?? method(kind);
    const methods = d === 'audio' ? [keep('audio')] : d === 'motion' ? [keep('motion')] : d === 'both' ? [keep('audio'), keep('motion')] : [method('subtitle')];
    s.edit = { ...s.edit, mode: 'builder', combine: 'or', methods };
  }

  let detect = $derived(detectOf(s.edit));
  let thresholdMethods = $derived(s.edit.mode === 'builder' ? s.edit.methods.filter((m) => m.kind === 'audio' || m.kind === 'motion') : []);

  // --- Actions -----------------------------------------------------------
  type Mode = 'cut' | 'nil' | 'speed' | 'volume' | 'custom';

  function modeOf(chain: ActionStep[]): Mode {
    if (chain.length === 0) return 'nil';
    if (chain.length !== 1) return 'custom';
    const n = chain[0].name;
    return n === 'cut' || n === 'nil' || n === 'speed' || n === 'volume' ? n : 'custom';
  }

  function setMode(which: 'whenInactive' | 'whenActive', m: Mode) {
    if (m === 'custom') {
      onAdvanced('actions');
      return;
    }
    const defaults: Record<string, string> = { speed: which === 'whenInactive' ? '8' : '1.25', volume: '0.3' };
    s[which] = [step(m, defaults[m] ? { value: defaults[m] } : {})];
  }

  let silent = $derived(modeOf(s.whenInactive));
  let loud = $derived(modeOf(s.whenActive));

  // --- Margin --------------------------------------------------------------
  let splitMargin = $state(false);
  $effect(() => {
    if (s.marginBefore !== s.marginAfter) splitMargin = true;
  });

  // --- Presets -------------------------------------------------------------
  let saveOpen = $state(false);
  let presetName = $state('');
  let presetDesc = $state('');
  let currentPreset = $derived(app.presets.find((p) => p.id === app.prefs.lastPresetId));

  function savePreset() {
    if (!presetName.trim()) return;
    app.savePreset(presetName.trim(), presetDesc.trim());
    app.notify(`Saved preset "${presetName.trim()}"`, 'success');
    saveOpen = false;
  }

  let exportDef = $derived(EXPORTS.find((e) => e.value === s.exportKind));
  let isMedia = $derived(s.exportKind === 'default' || s.exportKind === 'clip-sequence');
</script>

<section class="card quick">
  <div class="row">
    <Field label="Preset" help="Starting points. Changing a preset replaces the edit settings (your output folder is kept).">
      <select value={app.prefs.lastPresetId} onchange={(e) => app.applyPreset((e.currentTarget as HTMLSelectElement).value)}>
        <optgroup label="Built-in">
          {#each app.presets.filter((p) => p.builtin) as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </optgroup>
        {#if app.userPresets.length}
          <optgroup label="My presets">
            {#each app.userPresets as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
          </optgroup>
        {/if}
      </select>
      <button class="btn icon" aria-label="Save as preset" data-tip="Save current settings as a preset" onclick={() => { presetName = currentPreset && !currentPreset.builtin ? currentPreset.name : ''; presetDesc = ''; saveOpen = true; }}><Save size={15} /></button>
      {#if currentPreset && !currentPreset.builtin}
        <button class="btn icon danger" aria-label="Delete preset" data-tip="Delete this preset" onclick={() => app.deletePreset(currentPreset!.id)}><Trash2 size={15} /></button>
      {/if}
    </Field>
  </div>
  {#if currentPreset?.description}<p class="tiny faint desc">{currentPreset.description}</p>{/if}

  <hr />

  <Field label="Find the parts to keep by" help="What counts as 'active' (kept). Everything else is 'silent'.">
    <Segmented
      small
      value={detect}
      options={[
        { value: 'audio', label: 'Sound' },
        { value: 'motion', label: 'Motion' },
        { value: 'both', label: 'Sound or motion' },
        { value: 'subtitle', label: 'Subtitles' },
        { value: 'custom', label: 'Custom…' },
      ]}
      onchange={setDetect}
    />
  </Field>

  {#each thresholdMethods as m (m.id)}
    <Field label="{METHOD_MAP[m.kind].short} threshold" help={m.kind === 'audio' ? 'Audio quieter than this counts as silence. Raise it if background noise is being kept; lower it if quiet speech gets cut.' : 'How much the picture must change between frames to count as motion.'}>
      <ThresholdInput bind:value={m.params.threshold} fallback={m.kind === 'audio' ? '0.04' : '0.02'} allowDb={m.kind === 'audio'} />
    </Field>
  {/each}
  {#if detect === 'subtitle'}
    <p class="tiny faint">Keeps sections with a subtitle line — embedded, or a .srt next to the video. No subtitles? Use the Transcribe tab first.</p>
  {/if}
  {#if detect === 'custom'}
    <p class="tiny faint">Custom detection rule — <button class="link" onclick={() => onAdvanced('detect')}>edit it in Detect &amp; pace</button>.</p>
  {/if}

  <Field label="Margin" help="Padding kept around active parts so words aren't clipped. Default 0.2s.">
    {#if splitMargin}
      <div class="row grow">
        <LengthInput bind:value={s.marginBefore} placeholder="before" />
        <LengthInput bind:value={s.marginAfter} placeholder="after" />
      </div>
    {:else}
      <LengthInput bind:value={s.marginBefore} placeholder="0.2" onchange={(v) => (s.marginAfter = v)} />
    {/if}
  </Field>
  <label class="tiny faint split">
    <input
      type="checkbox"
      bind:checked={splitMargin}
      onchange={() => {
        if (!splitMargin) s.marginAfter = s.marginBefore;
      }}
    /> Different before / after
  </label>

  <Field label="Silent parts" help="What happens to sections that aren't active.">
    <Segmented
      small
      value={silent}
      options={[
        { value: 'cut', label: 'Cut' },
        { value: 'speed', label: 'Speed up' },
        { value: 'volume', label: 'Quieter' },
        { value: 'nil', label: 'Keep' },
        { value: 'custom', label: 'Custom…' },
      ]}
      onchange={(m) => setMode('whenInactive', m)}
    />
  </Field>
  {#if silent === 'speed'}
    <Field label="Speed ×" inline><input type="number" min="0.1" step="0.5" bind:value={s.whenInactive[0].args.value} style="width: 90px" /></Field>
  {:else if silent === 'volume'}
    <Field label="Volume (1 = unchanged)" inline><input type="number" min="0" step="0.05" bind:value={s.whenInactive[0].args.value} style="width: 90px" /></Field>
  {:else if silent === 'custom'}
    <p class="tiny faint">Custom actions — <button class="link" onclick={() => onAdvanced('actions')}>edit in Actions</button>.</p>
  {/if}

  <Field label="Active parts" help="What happens to the parts that are kept.">
    <Segmented
      small
      value={loud}
      options={[
        { value: 'nil', label: 'Keep as is' },
        { value: 'speed', label: 'Speed up' },
        { value: 'cut', label: 'Cut' },
        { value: 'custom', label: 'Custom…' },
      ]}
      onchange={(m) => setMode('whenActive', m)}
    />
  </Field>
  {#if loud === 'speed'}
    <Field label="Speed ×" inline><input type="number" min="0.1" step="0.05" bind:value={s.whenActive[0].args.value} style="width: 90px" /></Field>
  {:else if loud === 'custom' || loud === 'volume'}
    <p class="tiny faint">Custom actions — <button class="link" onclick={() => onAdvanced('actions')}>edit in Actions</button>.</p>
  {/if}

  <hr />

  <Field label="Output" help={exportDef?.help ?? ''}>
    <select bind:value={s.exportKind}>
      {#each ['Media', 'Editors', 'Timeline'] as g (g)}
        <optgroup label={g === 'Media' ? 'Media' : g === 'Editors' ? 'Video editor project' : 'auto-editor timeline'}>
          {#each EXPORTS.filter((e) => e.group === g) as e (e.value)}<option value={e.value}>{e.label}</option>{/each}
        </optgroup>
      {/each}
    </select>
    {#if isMedia}
      <select bind:value={s.container} style="width: 156px; flex: none" data-tip="Output container">
        {#each CONTAINERS as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
      </select>
    {/if}
  </Field>
  <Field label="Save to" help="Leave empty to save next to each input. Files get the suffix below.">
    <PathInput bind:value={s.outputDir} mode="directory" placeholder="Next to each input" />
  </Field>
</section>

<Modal bind:open={saveOpen} title="Save preset">
  <Field label="Name"><input type="text" bind:value={presetName} placeholder="My podcast settings" onkeydown={(e) => e.key === 'Enter' && savePreset()} /></Field>
  <Field label="Description (optional)"><input type="text" bind:value={presetDesc} /></Field>
  <p class="tiny faint">Saving with an existing name updates that preset.</p>
  {#snippet footer()}
    <button class="btn" onclick={() => (saveOpen = false)}>Cancel</button>
    <button class="btn primary" onclick={savePreset} disabled={!presetName.trim()}>Save</button>
  {/snippet}
</Modal>

<style>
  .quick {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .quick > .row > :global(.field) {
    flex: 1;
  }
  .desc {
    margin-top: -6px;
  }
  hr {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 2px 0;
    width: 100%;
  }
  .split {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: -6px;
    cursor: pointer;
  }
  .link {
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent);
    font: inherit;
  }
  .link:hover {
    text-decoration: underline;
  }
</style>
