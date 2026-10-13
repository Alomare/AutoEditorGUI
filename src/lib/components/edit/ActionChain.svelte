<script lang="ts">
  // Editor for a chain of actions (applied in order, joined with commas).
  import { ArrowDown, ArrowUp, Plus, Trash2, KeyRound } from '@lucide/svelte';
  import { ACTION_GROUPS, ACTIONS, ACTION_MAP, EASE_CURVES } from '$lib/catalog';
  import { step, type ActionStep } from '$lib/model';
  import { isNumber, isRamp, serializeChain } from '$lib/serialize';
  import { MEDIA_EXTENSIONS } from '$lib/catalog';
  import Help from '../ui/Help.svelte';
  import PathInput from '../ui/PathInput.svelte';

  let {
    chain = $bindable(),
    label = '',
    emptyMeans = 'nil',
  }: { chain: ActionStep[]; label?: string; emptyMeans?: string } = $props();

  function setName(i: number, name: string) {
    chain[i] = { id: chain[i].id, name, args: {}, raw: name === 'raw' ? serializeChain([chain[i]]) : undefined };
  }

  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= chain.length) return;
    [chain[i], chain[j]] = [chain[j], chain[i]];
  }

  function invalid(kind: string, v: string | undefined): boolean {
    const t = (v ?? '').trim();
    if (!t) return false;
    if (kind === 'number') return !isNumber(t);
    if (kind === 'ramp') return !isRamp(t);
    return false;
  }

  const overlayFilters = [{ name: 'Media', extensions: [...MEDIA_EXTENSIONS, 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }];
  let text = $derived(serializeChain(chain));
</script>

<div class="chain">
  {#if label}<div class="section-title">{label}</div>{/if}

  {#each chain as s, i (s.id)}
    {@const def = ACTION_MAP[s.name]}
    <div class="step">
      <div class="head">
        <span class="idx">{i + 1}</span>
        <select class="name" value={s.name} onchange={(e) => setName(i, (e.currentTarget as HTMLSelectElement).value)}>
          {#each ACTION_GROUPS as g (g)}
            <optgroup label={g}>
              {#each ACTIONS.filter((a) => a.group === g) as a (a.name)}
                <option value={a.name}>{a.label}{a.media === 'A' ? ' (audio)' : a.media === 'V' ? ' (video)' : ''}</option>
              {/each}
            </optgroup>
          {/each}
          <optgroup label="Other">
            <option value="raw">Custom text…</option>
          </optgroup>
        </select>
        {#if def}<Help text={def.help} />{/if}
        {#if def?.license}<span class="badge warn" data-tip="Needs an auto-editor license key (Settings → License)"><KeyRound size={11} /> License</span>{/if}
        <span class="spacer"></span>
        <button class="btn ghost icon small" aria-label="Move up" disabled={i === 0} onclick={() => move(i, -1)}><ArrowUp size={14} /></button>
        <button class="btn ghost icon small" aria-label="Move down" disabled={i === chain.length - 1} onclick={() => move(i, 1)}><ArrowDown size={14} /></button>
        <button class="btn ghost icon small" aria-label="Remove action" onclick={() => chain.splice(i, 1)}><Trash2 size={14} /></button>
      </div>

      {#if s.name === 'raw'}
        <input type="text" class="mono" bind:value={s.raw} placeholder="e.g. speed:1.5,varispeed:1.5" spellcheck="false" />
      {:else if def && def.params.length}
        <div class="params">
          {#each def.params.filter((p) => !p.showIf || p.showIf(s.args)) as p (p.name)}
            <label class="param" class:wide={p.kind === 'file'} data-tip={p.help ?? null}>
              <span class="plabel">{p.label}</span>
              {#if p.kind === 'select'}
                <select bind:value={s.args[p.name]}>
                  {#if p.default === undefined && !p.options?.some((o) => o.value === '')}<option value="">Default</option>{/if}
                  {#each p.options ?? [] as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
                </select>
              {:else if p.kind === 'flag'}
                <input type="checkbox" checked={s.args[p.name] === 'true'} onchange={(e) => (s.args[p.name] = (e.currentTarget as HTMLInputElement).checked ? 'true' : '')} />
              {:else if p.kind === 'color'}
                <span class="row">
                  <input type="color" value={/^#[0-9a-f]{6}$/i.test(s.args[p.name] ?? '') ? s.args[p.name] : p.default ?? '#000000'} oninput={(e) => (s.args[p.name] = (e.currentTarget as HTMLInputElement).value)} />
                  <input type="text" bind:value={s.args[p.name]} placeholder={p.default ?? ''} spellcheck="false" />
                </span>
              {:else if p.kind === 'file'}
                <PathInput bind:value={s.args[p.name]} filters={overlayFilters} placeholder="Choose an image, video or audio file" />
              {:else}
                <input
                  type="text"
                  bind:value={s.args[p.name]}
                  class:invalid={invalid(p.kind, s.args[p.name])}
                  placeholder={p.placeholder ?? p.default ?? ''}
                  spellcheck="false"
                />
              {/if}
            </label>
          {/each}
          {#if def.animatable}
            <label class="param" data-tip="Easing for the animation (only matters with keyframes like 1..1.5)">
              <span class="plabel">Easing</span>
              <select bind:value={s.ease}>
                <option value="">None</option>
                {#each EASE_CURVES as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
              </select>
            </label>
            {#if s.ease}
              <label class="param" data-tip="How long the animation takes (e.g. 2sec), then it holds. Empty = whole section.">
                <span class="plabel">Ease duration</span>
                <input type="text" bind:value={s.easeDuration} placeholder="whole section" spellcheck="false" />
              </label>
            {/if}
          {/if}
        </div>
        {#if s.name === 'add' && (s.args.path ?? '').includes(',')}
          <p class="small" style="color: var(--danger)">The file path can't contain a comma — rename the file or folder.</p>
        {/if}
      {/if}
    </div>
  {/each}

  <div class="row">
    <button class="btn small" onclick={() => chain.push(step(chain.length === 0 ? 'speed' : 'volume'))}><Plus size={13} /> Add action</button>
    <span class="spacer"></span>
    <code class="small faint ellipsis" title={text}>{chain.length ? text : `${emptyMeans} (empty)`}</code>
  </div>
</div>

<style>
  .chain {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .step {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .idx {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--surface-3);
    color: var(--text-3);
    font-size: 11px;
    font-weight: 700;
    flex: none;
  }
  .name {
    width: auto;
    max-width: 260px;
    font-weight: 600;
  }
  .params {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px;
  }
  .param {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .param.wide {
    grid-column: 1 / -1;
  }
  .plabel {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-3);
  }
  code {
    max-width: 60%;
  }
</style>
