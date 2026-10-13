<script lang="ts">
  import { splitArgs } from '$lib/args';
  import { app } from '$lib/state.svelte';
  import Field from '../ui/Field.svelte';
  import Toggle from '../ui/Toggle.svelte';

  const s = $derived(app.settings);
  let parsedExtra = $derived(splitArgs(s.extraArgs));
</script>

<div class="panel">
  <section>
    <h3>Downloading from URLs</h3>
    <p class="small muted">
      {#if app.ytdlp}Using yt-dlp at <code>{app.ytdlp.path}</code>.{:else}yt-dlp isn't set up — get it in Settings → Tools.{/if}
    </p>
    <div class="grid2">
      <Field label="Download file name template" help="yt-dlp output template (--output-format), e.g. %(title)s.%(ext)s.">
        <input type="text" bind:value={s.ytdlpFormat} placeholder="yt-dlp default" spellcheck="false" />
      </Field>
      <Field label="Extra yt-dlp options" help={'Passed to yt-dlp (--yt-dlp-extras), e.g. -f "bv*[height<=1080]+ba" or --cookies-from-browser firefox.'}>
        <input type="text" class="mono" bind:value={s.ytdlpExtras} placeholder="" spellcheck="false" />
      </Field>
    </div>
  </section>

  <section>
    <h3>Behavior</h3>
    <div class="col">
      <Toggle bind:checked={s.openAfter} label="Open the result when done" help="--open: open the output with its default app when editing finishes." />
      <Toggle bind:checked={s.noCache} label="Don't use the analysis cache" help="--no-cache: auto-editor normally caches audio/motion analysis so re-running on the same file is instant." />
      <Toggle bind:checked={s.debug} label="Debug output" help="--debug: show debugging messages in the log." />
      <Toggle bind:checked={s.quiet} label="Less output" help="--quiet: fewer messages in the log." />
    </div>
  </section>

  <section>
    <h3>Extra arguments</h3>
    <Field label="Added to every run, as on a command line" help="For anything not covered by the GUI — including options from newer auto-editor versions. Quote values with spaces.">
      <input type="text" class="mono" bind:value={s.extraArgs} placeholder="e.g. --some-new-option value" spellcheck="false" />
    </Field>
    {#if parsedExtra.length}
      <div class="row wrap">
        {#each parsedExtra as a, i (i)}<code class="badge">{a}</code>{/each}
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
    gap: 10px;
  }
</style>
