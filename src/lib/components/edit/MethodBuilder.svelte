<script lang="ts">
  // Editor for an EditSpec: one or more detection methods combined with
  // or/and/xor, each optionally inverted — or a raw expression.
  import { Plus, Trash2, ChevronDown, ChevronRight } from '@lucide/svelte';
  import { METHODS, METHOD_MAP } from '$lib/catalog';
  import { method, type EditSpec, type MethodKind } from '$lib/model';
  import { serializeEdit } from '$lib/serialize';
  import Field from '../ui/Field.svelte';
  import Help from '../ui/Help.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import ThresholdInput from './ThresholdInput.svelte';

  let { spec = $bindable(), compact = false }: { spec: EditSpec; compact?: boolean } = $props();

  let expanded = $state<Record<string, boolean>>({});

  const PRIMARY = new Set(['threshold', 'pattern', 'value']);

  function add(kind: MethodKind) {
    spec.methods.push(method(kind));
  }

  function changeKind(i: number, kind: MethodKind) {
    spec.methods[i] = { ...spec.methods[i], kind, params: {} };
  }

  let preview = $derived(serializeEdit(spec) || 'audio (default)');
</script>

<div class="builder">
  <div class="row wrap">
    <Segmented
      bind:value={spec.mode}
      options={[
        { value: 'builder', label: 'Detect', title: 'Build the rule from detection methods' },
        { value: 'all', label: 'Keep everything', title: 'Every moment counts as active ("1"); use with manual cuts' },
        { value: 'none', label: 'Nothing', title: 'No moment is active ("0"); use with manual keeps' },
        { value: 'raw', label: 'Expression', title: 'Type an auto-editor --edit expression' },
      ]}
      onchange={(m) => {
        if (m === 'raw' && !spec.raw.trim()) spec.raw = serializeEdit({ ...spec, mode: 'builder' });
      }}
    />
  </div>

  {#if spec.mode === 'builder'}
    {#if spec.methods.length > 1}
      <div class="row small">
        <span class="muted">Active when</span>
        <Segmented
          small
          bind:value={spec.combine}
          options={[
            { value: 'or', label: 'any', title: 'or: any method is active' },
            { value: 'and', label: 'all', title: 'and: every method is active' },
            { value: 'xor', label: 'exactly one', title: 'xor: an odd number of methods are active' },
          ]}
        />
        <span class="muted">of these match:</span>
      </div>
    {/if}

    {#each spec.methods as m, i (m.id)}
      {@const def = METHOD_MAP[m.kind]}
      <div class="method">
        <div class="head">
          <select class="kind" value={m.kind} onchange={(e) => changeKind(i, (e.currentTarget as HTMLSelectElement).value as MethodKind)}>
            {#each METHODS as d (d.kind)}<option value={d.kind}>{d.label}</option>{/each}
          </select>
          <Help text={def.help} />
          <label class="invert" data-tip="Invert: active where this method does NOT match (wraps it in (not …))">
            <input type="checkbox" bind:checked={m.negate} /> Invert
          </label>
          <span class="spacer"></span>
          <button class="btn ghost small" onclick={() => (expanded[m.id] = !expanded[m.id])}>
            {#if expanded[m.id]}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if} Options
          </button>
          {#if spec.methods.length > 1}
            <button class="btn ghost icon small" aria-label="Remove method" onclick={() => spec.methods.splice(i, 1)}><Trash2 size={14} /></button>
          {/if}
        </div>

        {#each def.params.filter((p) => PRIMARY.has(p.name)) as p (p.name)}
          <Field label={p.label} help={p.help ?? ''}>
            {#if p.kind === 'threshold'}
              <ThresholdInput bind:value={m.params[p.name]} fallback={p.default} allowDb={m.kind === 'audio'} />
            {:else}
              <input type="text" bind:value={m.params[p.name]} placeholder={p.placeholder ?? ''} spellcheck="false" />
            {/if}
          </Field>
        {/each}

        {#if expanded[m.id]}
          <div class="grid{compact ? '2' : '4'} extra">
            {#each def.params.filter((p) => !PRIMARY.has(p.name)) as p (p.name)}
              <Field label={p.label} help={p.help ?? ''}>
                {#if p.kind === 'bool'}
                  <select bind:value={m.params[p.name]}>
                    <option value="">Default ({p.default === '#t' ? 'yes' : 'no'})</option>
                    <option value="#t">Yes</option>
                    <option value="#f">No</option>
                  </select>
                {:else}
                  <input type="text" bind:value={m.params[p.name]} placeholder={p.placeholder ?? p.default} spellcheck="false" />
                {/if}
              </Field>
            {/each}
          </div>
        {/if}
      </div>
    {/each}

    <div class="row wrap">
      <span class="small faint">Add:</span>
      {#each METHODS as d (d.kind)}
        <button class="btn small" onclick={() => add(d.kind)}><Plus size={13} /> {d.short}</button>
      {/each}
    </div>
  {:else if spec.mode === 'raw'}
    <Field label="--edit expression" help="Any auto-editor edit expression, e.g. (or audio:0.03 motion:0.06) or (not word:um).">
      <input type="text" class="mono" bind:value={spec.raw} placeholder="(or audio:0.04 motion:0.02)" spellcheck="false" />
    </Field>
  {:else}
    <p class="small muted">
      {spec.mode === 'all' ? 'Every moment is treated as active. Combine with manual cuts or other label classes.' : 'No moment is active. Combine with manual "keep" ranges.'}
    </p>
  {/if}

  <div class="expr small"><span class="faint">--edit</span> <code>{preview}</code></div>
</div>

<style>
  .builder {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .method {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .kind {
    width: auto;
    font-weight: 600;
  }
  .invert {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    color: var(--text-2);
    cursor: pointer;
  }
  .extra {
    padding-top: 2px;
  }
  .expr {
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    overflow-wrap: anywhere;
  }
</style>
