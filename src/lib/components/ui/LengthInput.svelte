<script lang="ts">
  // A length for auto-editor: seconds ("0.2s") or frames ("6").
  let {
    value = $bindable(),
    placeholder = '',
    allowEmpty = true,
    step = 0.05,
    onchange,
  }: { value?: string; placeholder?: string; allowEmpty?: boolean; step?: number; onchange?: (v: string) => void } = $props();

  const SECONDS = /^(-?\d*\.?\d+)\s*(s|sec|secs|second|seconds)$/;

  function parse(v: unknown): { num: string; unit: 's' | 'f' } {
    const t = String(v ?? '').trim();
    const m = SECONDS.exec(t);
    if (m) return { num: m[1], unit: 's' };
    if (/^-?\d*\.?\d+$/.test(t)) return { num: t, unit: 'f' };
    return { num: '', unit: 's' };
  }

  let parsed = $derived(parse(value));
  let unit = $state<'s' | 'f'>('s');
  $effect(() => {
    if (String(value ?? '').trim()) unit = parsed.unit;
  });

  function set(num: string, u: 's' | 'f') {
    unit = u;
    if (num === '' && allowEmpty) value = '';
    else value = u === 's' ? `${num || 0}s` : `${Math.round(Number(num) || 0)}`;
    onchange?.(value);
  }
</script>

<div class="length">
  <input
    type="number"
    {step}
    value={parsed.num}
    {placeholder}
    oninput={(e) => set((e.currentTarget as HTMLInputElement).value, unit)}
  />
  <select value={unit} onchange={(e) => set(parsed.num, (e.currentTarget as HTMLSelectElement).value as 's' | 'f')}>
    <option value="s">sec</option>
    <option value="f">frames</option>
  </select>
</div>

<style>
  .length {
    display: flex;
    gap: 4px;
    width: 100%;
  }
  input {
    flex: 1;
    min-width: 60px;
  }
  select {
    width: 78px;
    flex: none;
  }
</style>
