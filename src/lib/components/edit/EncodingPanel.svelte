<script lang="ts">
  import { runCapture } from '$lib/backend';
  import { LAYOUT_SUGGESTIONS, PIXFMT_SUGGESTIONS, PRESET_SUGGESTIONS, PROFILE_SUGGESTIONS } from '$lib/catalog';
  import { extOf } from '$lib/model';
  import { app } from '$lib/state.svelte';
  import Field from '../ui/Field.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Toggle from '../ui/Toggle.svelte';

  const s = $derived(app.settings);

  // Codec choices come from auto-editor itself for the chosen container.
  let ext = $derived(s.container || extOf(app.inputs.find((i) => i.kind === 'file')?.value ?? '') || 'mp4');
  let encoders = $state<Record<string, { v: string[]; a: string[] }>>({});

  $effect(() => {
    const e = ext;
    const ae = app.autoEditor?.path;
    if (!ae || encoders[e]) return;
    runCapture(ae, ['info', '-encoders', e])
      .then((r) => {
        const pick = (k: string) => (new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(r.stdout)?.[1] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        encoders[e] = { v: pick('v'), a: pick('a') };
      })
      .catch(() => (encoders[e] = { v: [], a: [] }));
  });

  let list = $derived(encoders[ext] ?? { v: [], a: [] });
</script>

<div class="panel">
  <section>
    <h3>Video</h3>
    <div class="grid3">
      <Field label="Codec" help="Video encoder (--video-codec). Choices are what this auto-editor can write to .{ext}. 'Auto' picks a sensible default.">
        <select bind:value={s.videoCodec}>
          <option value="">Auto</option>
          {#each list.v as c (c)}<option value={c}>{c}</option>{/each}
          {#if s.videoCodec && !list.v.includes(s.videoCodec)}<option value={s.videoCodec}>{s.videoCodec}</option>{/if}
        </select>
      </Field>
      <Field label="Quality (CRF)" help="Constant Rate Factor, 0–63 (-crf). Lower = better quality, bigger file. 18–28 is typical for H.264.">
        <input type="number" min="0" max="63" bind:value={s.crf} placeholder="auto" />
      </Field>
      <Field label="Bitrate" help="Target video bitrate (--video-bitrate), e.g. 5M or 2500k. Use either this or CRF. 0 = variable.">
        <input type="text" bind:value={s.videoBitrate} placeholder="auto" />
      </Field>
      <Field label="Preset" help="Encoder speed/efficiency trade-off (--preset). Slower = smaller file at the same quality.">
        <input type="text" list="preset-list" bind:value={s.preset} placeholder="auto" />
      </Field>
      <Field label="Profile" help="Video profile (-vprofile). For H.264: baseline, main or high.">
        <input type="text" list="profile-list" bind:value={s.vprofile} placeholder="auto" />
      </Field>
      <Field label="Pixel format" help="Output pixel format (--pix-fmt). yuv420p plays everywhere; yuv420p10le keeps 10-bit.">
        <input type="text" list="pixfmt-list" bind:value={s.pixFmt} placeholder="auto" />
      </Field>
      <Field label="Keyframe interval (GOP)" help="Max frames between keyframes (--gop). Shorter = easier seeking, larger files.">
        <input type="number" min="1" bind:value={s.gop} placeholder="auto" />
      </Field>
      <Field label="Scale" help="Scale the output resolution by this factor (--scale), e.g. 0.5 for half size.">
        <input type="number" min="0.05" step="0.05" bind:value={s.scale} placeholder="1" />
      </Field>
    </div>
    <div class="row wrap toggles">
      <Toggle bind:checked={s.noPartialLossless} label="Re-encode everything" help="--no-partial-lossless: by default auto-editor copies untouched parts of H.264/HEVC/VP9/AV1 video without re-encoding (faster, lossless). Turn on to re-encode the whole video." />
      <Toggle bind:checked={s.noSeek} label="Disable seeking" help="--no-seek: decode linearly instead of seeking. Slower; helps debug audio/video desync." />
    </div>
  </section>

  <section>
    <h3>Audio</h3>
    <div class="grid3">
      <Field label="Codec" help="Audio encoder (--audio-codec) for .{ext}.">
        <select bind:value={s.audioCodec}>
          <option value="">Auto</option>
          {#each list.a as c (c)}<option value={c}>{c}</option>{/each}
          {#if s.audioCodec && !list.a.includes(s.audioCodec)}<option value={s.audioCodec}>{s.audioCodec}</option>{/if}
        </select>
      </Field>
      <Field label="Bitrate" help="Audio bitrate (--audio-bitrate), e.g. 192k.">
        <input type="text" bind:value={s.audioBitrate} placeholder="auto" />
      </Field>
      <Field label="Channel layout" help="Output channel layout (--audio-layout), e.g. mono or stereo.">
        <input type="text" list="layout-list" bind:value={s.audioLayout} placeholder="auto" />
      </Field>
    </div>
    <Toggle bind:checked={s.mixAudioStreams} label="Mix all audio tracks into one" help="--mix-audio-streams: e.g. merge a mic track and a game/desktop track." />

    <Field label="Loudness normalization" help="Applied right before rendering (--audio-normalize). EBU R128 targets perceived loudness; peak just scales to a maximum level.">
      <Segmented
        small
        bind:value={s.normalize.mode}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'ebu', label: 'EBU R128 (loudness)' },
          { value: 'peak', label: 'Peak' },
        ]}
      />
    </Field>
    {#if s.normalize.mode === 'ebu'}
      <div class="grid4">
        <Field label="Integrated (LUFS)" help="Target loudness. -23 broadcast, -16 streaming, -14 podcasts/music. Default -24.">
          <input type="number" step="0.5" min="-70" max="5" bind:value={s.normalize.i} placeholder="-24" />
        </Field>
        <Field label="Loudness range (LU)" help="1–50. Default 7.">
          <input type="number" step="0.5" min="1" max="50" bind:value={s.normalize.lra} placeholder="7" />
        </Field>
        <Field label="True peak (dBTP)" help="-9 to 0. Default -2.">
          <input type="number" step="0.5" min="-9" max="0" bind:value={s.normalize.tp} placeholder="-2" />
        </Field>
        <Field label="Gain (dB)" help="Extra gain on top, -99 to 99. Default 0.">
          <input type="number" step="0.5" bind:value={s.normalize.gain} placeholder="0" />
        </Field>
      </div>
    {:else if s.normalize.mode === 'peak'}
      <Field label="Maximum peak (dB)" help="E.g. -3 makes the loudest sample -3 dB.">
        <input type="number" step="0.5" max="0" bind:value={s.normalize.peak} placeholder="-3" style="max-width: 140px" />
      </Field>
    {/if}
  </section>

  <section>
    <h3>Container</h3>
    <div class="row wrap toggles">
      <Toggle bind:checked={s.vn} label="No video (-vn)" />
      <Toggle bind:checked={s.an} label="No audio (-an)" />
      <Toggle bind:checked={s.sn} label="No subtitles (-sn)" />
      <Toggle bind:checked={s.dn} label="No data streams (-dn)" />
    </div>
    <div class="grid2">
      <Field label="Fast start (MP4/MOV)" help="Moves the index to the front so web players can start before the download finishes. On by default; turning it off is faster for big files.">
        <Segmented small bind:value={s.faststart} options={[{ value: 'default', label: 'Default (on)' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      </Field>
      <Field label="Fragmented MP4/MOV" help="Lets the file play while it's still being written. Off by default for compatibility.">
        <Segmented small bind:value={s.fragmented} options={[{ value: 'default', label: 'Default (off)' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]} />
      </Field>
    </div>
  </section>

  <datalist id="preset-list">{#each PRESET_SUGGESTIONS as v (v)}<option value={v}></option>{/each}</datalist>
  <datalist id="profile-list">{#each PROFILE_SUGGESTIONS as v (v)}<option value={v}></option>{/each}</datalist>
  <datalist id="pixfmt-list">{#each PIXFMT_SUGGESTIONS as v (v)}<option value={v}></option>{/each}</datalist>
  <datalist id="layout-list">{#each LAYOUT_SUGGESTIONS as v (v)}<option value={v}></option>{/each}</datalist>
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
  .toggles {
    gap: 18px;
  }
</style>
