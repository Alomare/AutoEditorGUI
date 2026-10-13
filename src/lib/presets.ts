// Built-in starting points. Each one is a full EditSettings built from the
// defaults, so applying a preset always gives a predictable result.

import { defaultSettings, method, step, type EditSettings } from './model';

export interface Preset {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
  settings: EditSettings;
}

function make(id: string, name: string, description: string, patch: (s: EditSettings) => void): Preset {
  const settings = defaultSettings();
  patch(settings);
  return { id, name, description, builtin: true, settings };
}

export const BUILTIN_PRESETS: Preset[] = [
  make('default', 'Cut silence (default)', 'auto-editor\'s defaults: remove quiet parts, keep a 0.2s margin.', () => {}),
  make('tight', 'Talking head — tight', 'Shorter margins for fast-paced talking videos.', (s) => {
    s.marginBefore = '0.1s';
    s.marginAfter = '0.15s';
    s.smooth = { mode: 'custom', minCut: '0.15s', minClip: '0.1s' };
  }),
  make('podcast', 'Podcast / interview', 'Gentle cuts with room to breathe, loudness normalized for streaming.', (s) => {
    s.edit.methods = [method('audio', { threshold: '-32dB' })];
    s.marginBefore = '0.3s';
    s.marginAfter = '0.5s';
    s.normalize = { ...s.normalize, mode: 'ebu', i: '-16', tp: '-1.5' };
  }),
  make('ffwd', 'Fast-forward silence (8×)', 'Keep everything, but race through the quiet parts.', (s) => {
    s.whenInactive = [step('speed', { value: '8' })];
  }),
  make('lecture', 'Lecture — speed up pauses', 'Play quiet parts at 2× with lowered volume instead of cutting.', (s) => {
    s.whenInactive = [step('speed', { value: '2' }), step('volume', { value: '0.5' })];
  }),
  make('duck', 'Lower silence volume', 'Nothing is cut; quiet parts are made quieter.', (s) => {
    s.whenInactive = [step('volume', { value: '0.3' })];
  }),
  make('screen', 'Screen recording — cut idle', 'Cut where neither the picture moves nor anyone speaks.', (s) => {
    s.edit.methods = [method('audio'), method('motion', { threshold: '0.02' })];
    s.edit.combine = 'or';
  }),
  make('black', 'Remove black frames', 'Keep everything except mostly-black frames.', (s) => {
    s.edit.methods = [method('blackdetect', {}, true)];
  }),
  make('subtitles', 'Keep only speech (subtitles)', 'Keep sections with a subtitle line. Transcribe first if the video has none.', (s) => {
    s.edit.methods = [method('subtitle')];
  }),
  make('premiere', 'Export to Premiere Pro', 'Make a Premiere project with the cuts instead of rendering.', (s) => {
    s.exportKind = 'premiere';
  }),
  make('resolve', 'Export to DaVinci Resolve', 'Make a Resolve timeline with the cuts instead of rendering.', (s) => {
    s.exportKind = 'resolve';
  }),
  make('clips', 'Split into clips', 'One file per kept section.', (s) => {
    s.exportKind = 'clip-sequence';
  }),
  make('inverse', 'Show only what would be cut', 'Keep the silence and cut everything else — handy for checking a threshold.', (s) => {
    s.whenActive = [step('cut')];
    s.whenInactive = [step('nil')];
  }),
];
