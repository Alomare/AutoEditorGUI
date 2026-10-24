// Builds the portable release: dist/AutoEditorGUI-<version>-windows-<arch>/
// (+ .zip) containing the app, a bundled auto-editor, and license files.
//
//   npm run tauri build -- --no-bundle   (builds the exe)
//   npm run package                      (assembles the folder and zip)
//
// Options: --arch x86_64|aarch64, --no-zip, --ae-version 31.7.2,
//          --no-auto-editor (leave auto-editor out; the app offers to
//          download it on first start, and the zip has no GPL component)

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLicenses } from './licenses.mjs';

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
const withAutoEditor = !args.includes('--no-auto-editor');

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

const name = `AutoEditorGUI-${version}-windows-${archLabel}${withAutoEditor ? '' : '-no-auto-editor'}`;
const dist = join(root, 'dist');
const out = join(dist, name);
const cache = join(dist, 'cache');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'bin'), { recursive: true });
mkdirSync(cache, { recursive: true });

const userAgent = 'AutoEditorGUI-packager';

/** Download `url` into the cache once (re-download if `size` doesn't match). */
async function cached(file, url, size) {
  const path = join(cache, file);
  if (existsSync(path) && (size === undefined || statSync(path).size === size)) return path;
  console.log(`Downloading ${url}…`);
  const res = await fetch(url, { headers: { 'User-Agent': userAgent } });
  if (!res.ok) throw new Error(`Download failed: ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (size !== undefined && buf.length !== size) throw new Error(`Size mismatch: got ${buf.length}, expected ${size}`);
  writeFileSync(path, buf);
  return path;
}

// --- auto-editor ------------------------------------------------------------
let aeTag = '';
if (withAutoEditor) {
  const asset = `auto-editor-windows-${arch}.exe`;
  const api =
    aeVersion === 'latest'
      ? 'https://api.github.com/repos/WyattBlue/auto-editor/releases/latest'
      : `https://api.github.com/repos/WyattBlue/auto-editor/releases/tags/${aeVersion}`;
  const releaseRes = await fetch(api, { headers: { 'User-Agent': userAgent, Accept: 'application/vnd.github+json' } });
  if (!releaseRes.ok) {
    // e.g. 403 when the unauthenticated API rate limit is used up
    console.error(`GitHub API returned ${releaseRes.status} for ${api}`);
    process.exit(1);
  }
  const release = await releaseRes.json();
  const a = release.assets?.find((x) => x.name === asset);
  if (!a) {
    console.error(`No ${asset} in auto-editor release ${release.tag_name ?? aeVersion}`);
    process.exit(1);
  }
  aeTag = release.tag_name;
  copyFileSync(await cached(`${aeTag}-${asset}`, a.browser_download_url, a.size), join(out, 'bin', 'auto-editor.exe'));
  // The binary includes GPL code (FFmpeg built with x264/x265), so it travels
  // with the GPL's text.
  copyFileSync(await cached('gpl-2.0.txt', 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt'), join(out, 'bin', 'auto-editor.GPL-2.0.txt'));
}

// --- app + docs -------------------------------------------------------------
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
copyFileSync(exe, join(out, 'AutoEditorGUI.exe'));
writeFileSync(join(out, 'LICENSE.txt'), crlf(readFileSync(join(root, 'LICENSE'), 'utf8')));
writeFileSync(join(out, 'THIRD_PARTY_LICENSES.txt'), crlf(buildLicenses({ arch })));

const notices = readFileSync(join(root, 'scripts', 'THIRD_PARTY_NOTICES.txt'), 'utf8');
// Sections between "[[auto-editor]]" markers only apply when it's bundled.
const aeSection = /\[\[auto-editor\]\]\r?\n([\s\S]*?)\[\[\/auto-editor\]\]\r?\n/g;
writeFileSync(
  join(out, 'THIRD_PARTY_NOTICES.txt'),
  crlf(notices.replace(aeSection, withAutoEditor ? '$1' : '').replaceAll('{{AE_VERSION}}', aeTag)),
);

writeFileSync(
  join(out, 'README.txt'),
  crlf(`Auto-Editor GUI ${version}
=====================

A portable graphical front end for auto-editor${aeTag ? ` ${aeTag}` : ''}.

Start:   double-click AutoEditorGUI.exe
Needs:   Windows 10 or 11 (uses the built-in Microsoft Edge WebView2)
Install: nothing. Everything stays in this folder:
           bin\\      auto-editor (and yt-dlp, if you download it in Settings)
           data\\     your settings and presets
           models\\   transcription models you download
${withAutoEditor ? '' : '\nauto-editor isn\'t included: the app offers to download it (about 45 MB)\nthe first time it starts.\n'}
Move or copy the whole folder anywhere, including a USB drive.
To update auto-editor, use Settings > Tools > Check for updates.

License: Auto-Editor GUI is MIT-licensed (LICENSE.txt). The components it
contains are listed in THIRD_PARTY_LICENSES.txt${withAutoEditor ? ', and bin\\auto-editor.exe\nis a separate program under its own terms (THIRD_PARTY_NOTICES.txt)' : ''}.

Project page: https://github.com/Alomare/AutoEditorGUI
auto-editor:  https://auto-editor.com
`),
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
