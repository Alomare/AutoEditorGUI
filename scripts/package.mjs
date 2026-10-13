// Builds the portable release: dist/AutoEditorGUI-<version>-windows-<arch>/
// (+ .zip) containing the app, a bundled auto-editor, and license files.
//
//   npm run tauri build -- --no-bundle   (builds the exe)
//   npm run package                      (assembles the folder and zip)
//
// Options: --arch x86_64|aarch64, --no-zip, --ae-version 31.7.2

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const arch = opt('arch', process.arch === 'arm64' ? 'aarch64' : 'x86_64');
const archLabel = arch === 'aarch64' ? 'arm64' : 'x64';
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const aeVersion = opt('ae-version', 'latest');

const target = arch === 'aarch64' ? 'aarch64-pc-windows-msvc' : '';
const exeCandidates = [
  join(root, 'src-tauri', 'target', target, 'release', 'AutoEditorGUI.exe'),
  join(root, 'src-tauri', 'target', target, 'release', 'autoeditorgui.exe'),
];
const exe = exeCandidates.find((p) => existsSync(p));
if (!exe) {
  console.error('Release exe not found. Run: npm run tauri build -- --no-bundle');
  process.exit(1);
}

const name = `AutoEditorGUI-${version}-windows-${archLabel}`;
const dist = join(root, 'dist');
const out = join(dist, name);
const cache = join(dist, 'cache');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'bin'), { recursive: true });
mkdirSync(cache, { recursive: true });

// --- auto-editor ------------------------------------------------------------
const asset = `auto-editor-windows-${arch}.exe`;
const api =
  aeVersion === 'latest'
    ? 'https://api.github.com/repos/WyattBlue/auto-editor/releases/latest'
    : `https://api.github.com/repos/WyattBlue/auto-editor/releases/tags/${aeVersion}`;
const headers = { 'User-Agent': 'AutoEditorGUI-packager', Accept: 'application/vnd.github+json' };
const release = await (await fetch(api, { headers })).json();
const a = release.assets?.find((x) => x.name === asset);
if (!a) {
  console.error(`No ${asset} in auto-editor release ${release.tag_name ?? aeVersion}`);
  process.exit(1);
}
const cached = join(cache, `${release.tag_name}-${asset}`);
if (!existsSync(cached) || statSync(cached).size !== a.size) {
  console.log(`Downloading auto-editor ${release.tag_name} (${(a.size / 1048576).toFixed(1)} MB)…`);
  const res = await fetch(a.browser_download_url, { headers: { 'User-Agent': headers['User-Agent'] } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length !== a.size) throw new Error(`Size mismatch: got ${buf.length}, expected ${a.size}`);
  writeFileSync(cached, buf);
}
copyFileSync(cached, join(out, 'bin', 'auto-editor.exe'));

// --- app + docs -------------------------------------------------------------
copyFileSync(exe, join(out, 'AutoEditorGUI.exe'));
copyFileSync(join(root, 'LICENSE'), join(out, 'LICENSE.txt'));
writeFileSync(
  join(out, 'THIRD_PARTY_NOTICES.txt'),
  readFileSync(join(root, 'scripts', 'THIRD_PARTY_NOTICES.txt'), 'utf8').replaceAll('{{AE_VERSION}}', release.tag_name),
);
writeFileSync(
  join(out, 'README.txt'),
  `Auto-Editor GUI ${version}
=====================

A portable graphical front end for auto-editor ${release.tag_name}.

Start:   double-click AutoEditorGUI.exe
Needs:   Windows 10 or 11 (uses the built-in Microsoft Edge WebView2)
Install: nothing. Everything stays in this folder:
           bin\\      auto-editor (and yt-dlp, if you download it in Settings)
           data\\     your settings and presets
           models\\   transcription models you download

Move or copy the whole folder anywhere, including a USB drive.
To update auto-editor, use Settings > Tools > Check for updates.

Project page: https://github.com/Alomare/AutoEditorGUI
auto-editor:  https://auto-editor.com
`.replace(/\n/g, '\r\n'),
);

console.log(`Folder: ${out}`);

// --- zip ----------------------------------------------------------------------
if (!args.includes('--no-zip')) {
  const zip = join(dist, `${name}.zip`);
  rmSync(zip, { force: true });
  const bsdtar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  if (existsSync(bsdtar)) {
    execFileSync(bsdtar, ['-a', '-c', '-f', zip, '-C', dist, name], { stdio: 'inherit' });
  } else {
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}' -DestinationPath '${zip}'`], { stdio: 'inherit' });
  }
  console.log(`Zip:    ${zip} (${(statSync(zip).size / 1048576).toFixed(1)} MB)`);
}
