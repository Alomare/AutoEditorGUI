<script lang="ts">
  import { Plus, Trash2 } from '@lucide/svelte';
  import { defaultEdit, method, step, uid } from '$lib/model';
  import { app } from '$lib/state.svelte';
  import Help from '../ui/Help.svelte';
  import ActionChain from './ActionChain.svelte';
  import MethodBuilder from './MethodBuilder.svelte';

  const s = $derived(app.settings);

  function addLabel() {
    const used = new Set(s.labels.map((l) => l.label));
    let n = 2;
    while (used.has(n) && n < 255) n++;
    s.labels.push({ id: uid('lbl'), label: n, edit: { ...defaultEdit(), methods: [method('motion', { threshold: '0.02' })] }, actions: [step('zoom', { value: '1.2' })] });
  }
</script>

<div class="panel">
  <div class="grid2 chains">
    <section>
      <h3>Active parts <Help text="--when-active (-w:1). Applied to frames matched by the detection rule. Actions run in order; e.g. speed then volume." /></h3>
      <ActionChain bind:chain={s.whenActive} emptyMeans="nil" />
    </section>
    <section>
      <h3>Silent parts <Help text="--when-inactive (-w:0). Applied to everything else. 'Cut' removes it; anything else keeps it with the effect." /></h3>
      <ActionChain bind:chain={s.whenInactive} emptyMeans="nil" />
    </section>
  </div>

  <section>
    <div class="row">
      <h3>Extra classes <Help text="Label classes 2–255 (--edit:N / --when:N): give other kinds of moments their own actions. Where classes overlap, the higher number wins. Example: zoom in wherever there's motion." /></h3>
      <span class="spacer"></span>
      <button class="btn small" onclick={addLabel}><Plus size={13} /> Add class</button>
    </div>
    {#if s.labels.length === 0}
      <p class="small faint">None. Add a class to, say, speed up very loud parts or zoom in when there's motion — on top of the main edit.</p>
    {/if}
    {#each s.labels as l, i (l.id)}
      <div class="label card">
        <div class="row">
          <strong>Class</strong>
          <input type="number" min="2" max="255" bind:value={l.label} style="width: 80px" />
          <span class="spacer"></span>
          <button class="btn ghost icon small" aria-label="Remove class" onclick={() => s.labels.splice(i, 1)}><Trash2 size={14} /></button>
        </div>
        <div class="grid2">
          <div class="col">
            <div class="section-title">Matches</div>
            <MethodBuilder bind:spec={l.edit} compact />
          </div>
          <div class="col">
            <div class="section-title">Then do</div>
            <ActionChain bind:chain={l.actions} />
          </div>
        </div>
      </div>
    {/each}
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
    min-width: 0;
  }
  h3 {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .chains {
    align-items: start;
  }
  .label {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    box-shadow: none;
  }
</style>
