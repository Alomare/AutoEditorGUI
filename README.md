# Auto-Editor GUI

A portable desktop app for [auto-editor](https://github.com/WyattBlue/auto-editor): cut silence, dead air and motionless parts out of videos and audio — and use every other auto-editor feature — without the command line.

- **Portable.** One folder, no installer, no Python. Unzip and run `AutoEditorGUI.exe`. Settings, presets, tools and models stay in that folder.
- **Straightforward.** Drop files in, pick a preset or adjust three settings, press Render. A live preview shows exactly what will be cut before you render.
- **Complete.** Every auto-editor 31.x option, action and subcommand is reachable, and anything newer can be passed as extra arguments.

## Features

| Area | What you can do |
|---|---|
| Inputs | Files (drag & drop, batch), URLs via yt-dlp, live microphone recording, auto-editor timelines (`.v1/.v2/.v3`, FCP7 XML) |
| Detection | Audio loudness (%, dB), motion (with region), black frames, subtitle regex, spoken words — combined with any/all/xor and invert, or a raw `--edit` expression |
| Actions | Chains for active and silent parts: cut, speed, varispeed, pitch, volume, de-esser, auto-duck, zoom, rotate, spin, blur, pixelate, opacity, color/chroma key, masks, overlays (`add`), confetti… with keyframe ramps and easing |
| Label classes | Extra `--edit:N` / `--when:N` classes (2–255) |
| Pacing | Margin before/after, smoothing, cross-dissolve transitions |
| Manual edits | Cut / keep / set-speed / set-action ranges (seconds, frames, `start`, `end`, negatives) |
| Export | Media file (any container), Premiere Pro, Premiere OTIO, DaVinci Resolve (FCPXML and FCP7), Final Cut Pro, Shotcut, Kdenlive, clip sequence, v1/v2/v3 timelines |
| Encoding | Video/audio codecs (listed from your auto-editor build), CRF, bitrate, preset, profile, pixel format, GOP, scale, EBU R128 / peak normalization, stream toggles, faststart, fragmented MP4 |
| Transcribe | `whisper` with Whisper or Parakeet models (one-click downloads), from a file or the mic; save subtitles next to the video and cut by speech |
| Tools | Media info, subtitle dump, description, codec support, levels/waveform export, cache management |
| Quality of life | Cut preview with loudness graph, job queue with progress/ETA/logs, presets, command-line preview, light/dark theme |

A license key (from [app.auto-editor.com](https://app.auto-editor.com)) is only needed for auto-editor's paid features: the `add` overlay action and timeline exports that combine several inputs. The key is passed via the `AE_PRIVATE_LK` environment variable, never on the command line.

## Download

Get `AutoEditorGUI-<version>-windows-x64.zip` from the Releases page, unzip it anywhere, and run `AutoEditorGUI.exe`. It needs Windows 10 or 11 (the Microsoft Edge WebView2 runtime ships with both).

The zip includes auto-editor. The app can update auto-editor and download yt-dlp and transcription models from **Settings → Tools**.

## Building from source

Requirements: [Node.js](https://nodejs.org) 20+, [Rust](https://rustup.rs) (MSVC toolchain on Windows) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev                      # run in development
npm test                               # unit tests
npm run tauri build -- --no-bundle     # release exe
npm run package                        # dist/AutoEditorGUI-<version>-windows-x64(.zip)
```

To check the generated command lines against a real auto-editor (needs `ffmpeg` on PATH):

```sh
AE_BIN=path/to/auto-editor.exe npm test
```

In development, the app's portable folders (`bin/`, `data/`, `models/`) are created next to the dev executable in `src-tauri/target/debug/`.

### Project layout

```
src/lib/model.ts         settings model (what presets store)
src/lib/catalog.ts       auto-editor's actions, edit methods, exports, models
src/lib/serialize.ts     action chains and edit expressions → auto-editor syntax
src/lib/args.ts          settings → command line
src/lib/components/      UI (edit, tools, settings)
src-tauri/src/process.rs running auto-editor, progress parsing, stop/kill
src-tauri/src/ctrlc.rs   graceful Ctrl-C to finish microphone recordings
src-tauri/src/download.rs tool and model downloads
scripts/package.mjs      portable zip
```

## License

MIT — see [LICENSE](LICENSE). auto-editor itself is public domain (Unlicense); its release binaries bundle FFmpeg and other libraries under their own licenses (see `scripts/THIRD_PARTY_NOTICES.txt`).
