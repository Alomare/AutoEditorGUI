<script lang="ts">
  import { Plus, Trash2 } from '@lucide/svelte';
  import { step, uid } from '$lib/model';
  import { isRangePoint } from '$lib/serialize';
  import { app } from '$lib/state.svelte';
  import Help from '../ui/Help.svelte';
  import ActionChain from './ActionChain.svelte';

  const s = $derived(app.settings);
  const bad = (v: string) => v.trim() !== '' && !isRangePoint(v);
  const TIME_HELP =
    'Times: seconds like 10s or 1.5sec, frames like 30, or start / end. Negative values count from the end (-10s, end = last 10 seconds). Start is included, stop is not.';
</script>

<div class="panel">
  <p class="small muted">Manual edits are applied on top of (and override) the automatic ones. To edit only by hand, set Detect to “Keep everything” or “Nothing”. <Help text={TIME_HELP} /></p>

  <section>
    <div class="row">
      <h3>Always cut <Help text="--cut START,STOP: remove these ranges." /></h3>
      <span class="spacer"></span>
      <button class="btn small" onclick={() => s.cut.push({ id: uid('r'), start: '', stop: '' })}><Plus size={13} /> Add range</button>
    </div>
    {#each s.cut as r, i (r.id)}
      <div class="range">
        <input type="text" bind:value={r.start} placeholder="from (e.g. 0, 10s, start)" class:invalid={bad(r.start)} />
        <span class="faint">→</span>
        <input type="text" bind:value={r.stop} placeholder="to (e.g. 30s, end)" class:invalid={bad(r.stop)} />
        <button class="btn ghost icon small" aria-label="Remove" onclick={() => s.cut.splice(i, 1)}><Trash2 size={14} /></button>
      </div>
    {/each}
  </section>

  <section>
    <div class="row">
      <h3>Always keep <Help text="--keep START,STOP: leave these ranges as they are, overriding other actions." /></h3>
      <span class="spacer"></span>
      <button class="btn small" onclick={() => s.keep.push({ id: uid('r'), start: '', stop: '' })}><Plus size={13} /> Add range</button>
    </div>
    {#each s.keep as r, i (r.id)}
      <div class="range">
        <input type="text" bind:value={r.start} placeholder="from" class:invalid={bad(r.start)} />
        <span class="faint">→</span>
        <input type="text" bind:value={r.stop} placeholder="to" class:invalid={bad(r.stop)} />
        <button class="btn ghost icon small" aria-label="Remove" onclick={() => s.keep.splice(i, 1)}><Trash2 size={14} /></button>
      </div>
    {/each}
  </section>

  <section>
    <div class="row">
      <h3>Set speed <Help text="--set-speed SPEED,START,STOP: play these ranges at a speed, overriding other actions." /></h3>
      <span class="spacer"></span>
      <button class="btn small" onclick={() => s.setSpeed.push({ id: uid('r'), speed: '2', start: '', stop: '' })}><Plus size={13} /> Add range</button>
    </div>
    {#each s.setSpeed as r, i (r.id)}
      <div class="range">
        <input type="number" step="0.25" min="0.01" bind:value={r.speed} style="width: 90px; flex: none" title="Speed ×" />
        <span class="faint">×</span>
        <input type="text" bind:value={r.start} placeholder="from" class:invalid={bad(r.start)} />
        <span class="faint">→</span>
        <input type="text" bind:value={r.stop} placeholder="to" class:invalid={bad(r.stop)} />
        <button class="btn ghost icon small" aria-label="Remove" onclick={() => s.setSpeed.splice(i, 1)}><Trash2 size={14} /></button>
      </div>
    {/each}
  </section>

  <section>
    <div class="row">
      <h3>Apply actions to a range <Help text="--set-action ACTIONS,START,END: run any actions (zoom, overlays, effects) on a time range. The range is always kept." /></h3>
      <span class="spacer"></span>
      <button class="btn small" onclick={() => s.setAction.push({ id: uid('r'), start: '', stop: '', actions: [step('zoom', { value: '1.5' })] })}><Plus size={13} /> Add range</button>
    </div>
    {#each s.setAction as r, i (r.id)}
      <div class="card block">
        <div class="range">
          <input type="text" bind:value={r.start} placeholder="from" class:invalid={bad(r.start)} />
          <span class="faint">→</span>
          <input type="text" bind:value={r.stop} placeholder="to" class:invalid={bad(r.stop)} />
          <button class="btn ghost icon small" aria-label="Remove" onclick={() => s.setAction.splice(i, 1)}><Trash2 size={14} /></button>
        </div>
        <ActionChain bind:chain={r.actions} />
      </div>
    {/each}
  </section>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h3 {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .range {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .range input[type='text'] {
    flex: 1;
  }
  .block {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: none;
  }
</style>
