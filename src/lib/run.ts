// Turning the current inputs + settings into jobs, with checks first.

import { outputPathFor, renderArgs } from './args';
import { EXPORT_MAP } from './catalog';
import type { JobSpec } from './jobs.svelte';
import { baseName, dirName, inputLabel, type InputItem } from './model';
import { app } from './state.svelte';

export interface Plan {
  jobs: JobSpec[];
  errors: string[];
  warnings: string[];
}

function usesAdd(): boolean {
  const s = app.settings;
  const chains = [s.whenActive, s.whenInactive, ...s.labels.map((l) => l.actions), ...s.setAction.map((r) => r.actions)];
  return chains.some((c) => c.some((a) => a.name === 'add' || (a.name === 'raw' && /(^|,)\s*add:/.test(a.raw ?? ''))));
}

export function planJobs(): Plan {
  const s = app.settings;
  const errors: string[] = [];
  const warnings: string[] = [];
  const ae = app.autoEditor?.path ?? '';
  if (!ae) errors.push('auto-editor isn\'t set up. Go to Settings → Tools.');
  if (app.inputs.length === 0) errors.push('Add at least one file, URL or microphone.');

  const fallbackDir = app.prefs.defaultOutputDir || app.videosDir || '';
  const ctx = { ytdlpPath: app.ytdlp?.path };
  const exportLabel = EXPORT_MAP[s.exportKind].label;
  const combine = app.prefs.batchMode === 'combine' && app.inputs.length > 1;

  if (combine && s.exportKind === 'clip-sequence') errors.push('"Separate clips" works with one input at a time — switch to "Edit each separately".');
  if (combine && app.inputs.some((i) => i.kind !== 'file')) errors.push('Only files can be combined into one timeline.');
  if (combine && s.exportKind !== 'default' && !app.prefs.licenseKey) warnings.push('Exporting a timeline with several sources needs a license key.');
  if (usesAdd() && !app.prefs.licenseKey) warnings.push('The "Add overlay" action needs a license key (Settings → License).');
  if (app.inputs.some((i) => i.kind === 'url') && !app.ytdlp) errors.push('URL inputs need yt-dlp. Get it in Settings → Tools.');

  const env = app.env;
  const jobs: JobSpec[] = [];
  const groups: InputItem[][] = combine ? [app.inputs] : app.inputs.map((i) => [i]);
  // Output path (lowercased: Windows paths ignore case) → input that claimed it.
  const claimed = new Map<string, InputItem>();

  for (const group of groups) {
    const first = group[0];
    const output = outputPathFor(s, first, fallbackDir);
    if (output && group.some((i) => i.kind === 'file' && i.value.toLowerCase() === output.toLowerCase())) {
      errors.push(`The output for ${inputLabel(first)} would overwrite the input. Set a file name suffix or another folder.`);
      continue;
    }
    // e.g. talk.mov and talk.mp4 with the container set to mp4.
    const other = output ? claimed.get(output.toLowerCase()) : undefined;
    if (other) {
      errors.push(`${inputLabel(other)} and ${inputLabel(first)} would both be saved as ${baseName(output!)}. Edit them separately or change the output folder.`);
      continue;
    }
    if (output) claimed.set(output.toLowerCase(), first);
    const cwd = s.outputDir || (first.kind === 'file' ? dirName(first.value) : fallbackDir) || undefined;
    const title = combine
      ? `${group.length} inputs → ${exportLabel}`
      : first.kind === 'mic'
        ? `Recording → ${exportLabel}`
        : `${inputLabel(first)} → ${exportLabel}`;
    jobs.push({
      kind: first.kind === 'mic' ? 'record' : 'render',
      title,
      program: ae,
      args: ['--progress', 'machine', ...renderArgs(s, group.map((i) => i.value), output, ctx)],
      cwd,
      env,
      output: output ?? undefined,
    });
  }

  return { jobs, errors: [...new Set(errors)], warnings };
}
