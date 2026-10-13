<script lang="ts">
  import { CONTAINERS, EXPORTS, EXPORT_MAP, FRAMERATE_SUGGESTIONS, SAMPLERATE_SUGGESTIONS } from '$lib/catalog';
  import { outputPathFor } from '$lib/args';
  import { app } from '$lib/state.svelte';
  import Field from '../ui/Field.svelte';
  import PathInput from '../ui/PathInput.svelte';

  const s = $derived(app.settings);
  let def = $derived(EXPORT_MAP[s.exportKind]);
  let isMedia = $derived(s.exportKind === 'default' || s.exportKind === 'clip-sequence');
  let example = $derived.by(() => {
    const first = app.inputs.find((i) => i.kind === 'file');
    if (!first) return '';
    return outputPathFor(s, first, app.prefs.defaultOutputDir) ?? '';
  });
</script>

<div class="panel">
  <section>
    <h3>Export</h3>
    <div class="grid2">
      <Field label="Export as" help={def.help}>
        <select bind:value={s.exportKind}>
          {#each EXPORTS as e (e.value)}<option value={e.value}>{e.label}{e.ext ? ` (.${e.ext})` : ''}</option>{/each}
        </select>
      </Field>
      {#if isMedia}
        <Field label="Container" help="File type of the rendered output. 'Same as input' keeps the input's container.">
          <select bind:value={s.container}>
            {#each CONTAINERS as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
          </select>
        </Field>
      {/if}
      {#if def.name}
        <Field label="Timeline name" help="Name of the timeline/sequence inside the project (default: Auto-Editor Media Group).">
          <input type="text" bind:value={s.exportName} placeholder="Auto-Editor Media Group" />
        </Field>
      {/if}
      {#if def.version}
        <Field label="FCPXML version" help="Older editors may need version 10.">
          <select bind:value={s.exportVersion}>
            <option value="">11 (default)</option>
            <option value="10">10</option>
          </select>
        </Field>
      {/if}
    </div>
    {#if s.exportKind === 'clip-sequence'}
      <p class="small muted">Each kept section becomes its own file: name-0, name-1, … Works with one input at a time.</p>
    {/if}
  </section>

  <section>
    <h3>Where files go</h3>
    <div class="grid2">
      <Field label="Output folder" help="Empty = next to each input file.">
        <PathInput bind:value={s.outputDir} mode="directory" placeholder="Next to each input" />
      </Field>
      <Field label="File name suffix" help="Added to the input's name. Empty = same name (in another folder, or it would overwrite!).">
        <input type="text" bind:value={s.outputSuffix} placeholder="(none)" spellcheck="false" />
      </Field>
      <Field label="Recordings & downloads go to" help="Used for microphone recordings and URL downloads when no output folder is set.">
        <PathInput bind:value={app.prefs.defaultOutputDir} mode="directory" placeholder="Your Videos folder" />
      </Field>
    </div>
    {#if example}<p class="small faint">Example: <code>{example}</code></p>{/if}
    {#if !s.outputSuffix && !s.outputDir}
      <div class="notice warn small">With no suffix and no output folder, the output has the same path as the input. auto-editor will refuse or overwrite — set one of them.</div>
    {/if}
  </section>

  <section>
    <h3>Timeline</h3>
    <p class="small muted">Leave empty to match the (first) input.</p>
    <div class="grid4">
      <Field label="Frame rate" help="Timeline frame rate (--frame-rate), e.g. 30, 29.97, 30000/1001.">
        <input type="text" list="fps-list" bind:value={s.frameRate} placeholder="auto" />
      </Field>
      <Field label="Sample rate" help="Timeline audio sample rate (--sample-rate), e.g. 48000 or 44.1kHz.">
        <input type="text" list="sr-list" bind:value={s.sampleRate} placeholder="auto" />
      </Field>
      <Field label="Resolution" help="Timeline width × height (--resolution). Use with rotate for portrait video.">
        <div class="row">
          <input type="number" min="2" bind:value={s.resWidth} placeholder="W" />
          <span class="faint">×</span>
          <input type="number" min="2" bind:value={s.resHeight} placeholder="H" />
        </div>
      </Field>
      <Field label="Background" help="Solid color behind the picture (--background), e.g. #000000 or white.">
        <div class="row">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(s.background) ? s.background : '#000000'} oninput={(e) => (s.background = (e.currentTarget as HTMLInputElement).value)} />
          <input type="text" bind:value={s.background} placeholder="#000000" />
        </div>
      </Field>
    </div>
    <datalist id="fps-list">{#each FRAMERATE_SUGGESTIONS as v (v)}<option value={v}></option>{/each}</datalist>
    <datalist id="sr-list">{#each SAMPLERATE_SUGGESTIONS as v (v)}<option value={v}></option>{/each}</datalist>
  </section>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
</style>
