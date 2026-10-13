<script lang="ts">
  import { app } from '$lib/state.svelte';
  import Field from '../ui/Field.svelte';
  import LengthInput from '../ui/LengthInput.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import MethodBuilder from './MethodBuilder.svelte';

  const s = $derived(app.settings);
</script>

<div class="panel">
  <section>
    <h3>What counts as active</h3>
    <p class="small muted">auto-editor marks every frame as active (kept by default) or silent (cut by default). Build the rule here.</p>
    <MethodBuilder bind:spec={s.edit} />
  </section>

  <section>
    <h3>Pacing</h3>
    <div class="grid2">
      <Field label="Margin before" help="Extra time kept before each active part (--margin). Default 0.2s.">
        <LengthInput bind:value={s.marginBefore} placeholder="0.2" />
      </Field>
      <Field label="Margin after" help="Extra time kept after each active part. A longer after-margin avoids clipped word endings.">
        <LengthInput bind:value={s.marginAfter} placeholder="0.2" />
      </Field>
    </div>

    <Field label="Smoothing" help="Ignore tiny cuts and tiny clips so the edit doesn't stutter (--smooth). Default: min cut 0.2s, min clip 0.1s.">
      <Segmented
        small
        bind:value={s.smooth.mode}
        options={[
          { value: 'default', label: 'Default' },
          { value: 'custom', label: 'Custom' },
          { value: 'off', label: 'Off' },
        ]}
      />
    </Field>
    {#if s.smooth.mode === 'custom'}
      <div class="grid2">
        <Field label="Minimum cut" help="Silences shorter than this are kept."><LengthInput bind:value={s.smooth.minCut} placeholder="0.2" /></Field>
        <Field label="Minimum clip" help="Active bits shorter than this are dropped."><LengthInput bind:value={s.smooth.minClip} placeholder="0.1" /></Field>
      </div>
    {/if}

    <Toggle bind:checked={s.transition.enabled} label="Cross-dissolve at cuts" help="Blend cut points with a linked video/audio dissolve and fade the start and end (--transition). Carried into editor exports too." />
    {#if s.transition.enabled}
      <div class="grid2">
        <Field label="Dissolve length"><LengthInput bind:value={s.transition.duration} placeholder="0.5" allowEmpty={false} /></Field>
        <Field label="Only for cuts longer than" help="Short trims stay hard cuts (a dissolve across a tiny gap looks like a stutter). 0 = every cut. Default 1s.">
          <LengthInput bind:value={s.transition.minCut} placeholder="1" />
        </Field>
      </div>
    {/if}
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
    gap: 12px;
  }
</style>
