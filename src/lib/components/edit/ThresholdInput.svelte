<script lang="ts">
  // Threshold as a slider in % or dB, writing auto-editor syntax ("4%", "-28dB").
  import { fractionToDb, thresholdToFraction } from '$lib/serialize';
  import Segmented from '../ui/Segmented.svelte';

  let {
    value = $bindable(),
    fallback = '0.04',
    allowDb = true,
  }: { value?: string; fallback?: string; allowDb?: boolean } = $props();

  let fraction = $derived(thresholdToFraction(String(value ?? '')) ?? thresholdToFraction(fallback) ?? 0.04);
  let unit = $state<'pct' | 'db'>('pct');
  $effect(() => {
    if (/dB$/.test(String(value ?? '').trim())) unit = 'db';
  });

  let pct = $derived(Math.round(fraction * 1000) / 10);
  let db = $derived(Math.round(fractionToDb(fraction) * 10) / 10);

  function setPct(p: number) {
    value = `${Math.round(p * 10) / 10}%`;
  }
  function setDb(d: number) {
    value = `${Math.round(d * 10) / 10}dB`;
  }
  function switchUnit(u: 'pct' | 'db') {
    if (u === 'db') setDb(db);
    else setPct(pct);
  }
</script>

<div class="threshold">
  {#if unit === 'pct'}
    <input type="range" min="0" max="30" step="0.5" value={Math.min(pct, 30)} oninput={(e) => setPct(+(e.currentTarget as HTMLInputElement).value)} />
    <input class="num" type="number" min="0" max="100" step="0.5" value={pct} oninput={(e) => setPct(+(e.currentTarget as HTMLInputElement).value)} />
    <span class="unit">%</span>
  {:else}
    <input type="range" min="-60" max="0" step="0.5" value={Math.max(db, -60)} oninput={(e) => setDb(+(e.currentTarget as HTMLInputElement).value)} />
    <input class="num" type="number" min="-100" max="0" step="0.5" value={db} oninput={(e) => setDb(+(e.currentTarget as HTMLInputElement).value)} />
    <span class="unit">dB</span>
  {/if}
  {#if allowDb}
    <Segmented small bind:value={unit} options={[{ value: 'pct', label: '%' }, { value: 'db', label: 'dB' }]} onchange={switchUnit} />
  {/if}
</div>

<style>
  .threshold {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  input[type='range'] {
    flex: 1;
    min-width: 80px;
  }
  .num {
    width: 74px;
    flex: none;
  }
  .unit {
    width: 18px;
    color: var(--text-3);
    font-size: 12.5px;
  }
</style>
