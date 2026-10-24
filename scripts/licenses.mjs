// Builds THIRD_PARTY_LICENSES.txt: the license texts of everything compiled
// into AutoEditorGUI.exe — the Rust crates linked into it, the npm packages
// bundled into its UI, Rust's standard library and the WebView2 loader.
//
//   node scripts/licenses.mjs [out.txt] [--arch x86_64|aarch64]
//
// Needs a frontend build first (npm run build, or tauri build): the npm list
// comes from Vite's license metadata (build.license in vite.config.js).

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LICENSE_FILE = /^(licen[cs]e|copying|notice|copyright)/i;

/** Crates whose code ends up in the binary: normal dependencies of the app,
 *  minus proc-macros (they only run at compile time) and what only they use. */
function rustCrates(triple) {
  const meta = JSON.parse(
    execFileSync('cargo', ['metadata', '--format-version', '1', '--filter-platform', triple, '--manifest-path', join(root, 'src-tauri', 'Cargo.toml')], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }),
  );
  const pkgs = new Map(meta.packages.map((p) => [p.id, p]));
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  const isProcMacro = (p) => p.targets.some((t) => t.kind.includes('proc-macro'));
  const seen = new Set();
  const stack = [meta.resolve.root];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    for (const d of nodes.get(id).deps) {
      if (d.dep_kinds.some((k) => k.kind === null) && !isProcMacro(pkgs.get(d.pkg))) stack.push(d.pkg);
    }
  }
  seen.delete(meta.resolve.root);
  return [...seen]
    .map((id) => pkgs.get(id))
    .map((p) => {
      const dir = dirname(p.manifest_path);
      const files = readdirSync(dir)
        .filter((f) => LICENSE_FILE.test(f))
        .sort()
        .map((f) => readFileSync(join(dir, f), 'utf8'));
      return {
        name: p.name,
        version: p.version,
        license: p.license ?? `see ${p.license_file}`,
        source: `https://crates.io/crates/${p.name}/${p.version}`,
        authors: p.authors.map((a) => a.replace(/\s*<[^>]*>/, '')),
        repository: p.repository,
        texts: files,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

function npmPackages() {
  const file = join(root, '.svelte-kit', 'output', 'client', '.vite', 'licenses.json');
  if (!existsSync(file)) throw new Error(`${file} not found. Build the frontend first (npm run build).`);
  return JSON.parse(readFileSync(file, 'utf8'))
    .map((p) => ({
      name: p.name,
      version: p.version,
      license: p.identifier ?? 'see text',
      source: `https://www.npmjs.com/package/${p.name}/v/${p.version}`,
      authors: [],
      texts: p.text ? [p.text] : [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const MIT = (holder) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const BSD3 = (holder, extraClause = '') => `Copyright (c) ${holder}
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. ${extraClause || 'Neither the name of the copyright holder nor the names of its\n   contributors may be used to endorse or promote products derived from\n   this software without specific prior written permission.'}

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`;

/** A few crates publish without their license file; use the standard text
 *  of the license they declare (MIT where they offer a choice). */
function fillMissingTexts(crates) {
  const allTexts = crates.flatMap((c) => c.texts);
  const borrow = (marker) => allTexts.find((t) => t.includes(marker));
  for (const c of crates) {
    if (c.texts.length) continue;
    const holder = c.authors.length ? c.authors.join(', ') : `the ${c.name} contributors${c.repository ? ` (${c.repository})` : ''}`;
    const ids = c.license.split(/\s+(?:OR|AND)\s+|\//).map((s) => s.replace(/[()]/g, '').trim());
    let text;
    if (ids.includes('MIT')) text = MIT(holder);
    else if (ids.includes('BSD-3-Clause')) text = BSD3(holder);
    else if (ids.includes('MPL-2.0')) text = borrow('Mozilla Public License Version 2.0');
    else if (ids.includes('Apache-2.0')) text = borrow('Apache License') ;
    if (!text) throw new Error(`No license text for ${c.name} ${c.version} (${c.license})`);
    c.texts = [`[${c.name} doesn't ship a license file; standard ${ids[0]} text, as declared in its package metadata.]\n\n${text}`];
  }
}

export function buildLicenses({ arch = 'x86_64' } = {}) {
  const triple = `${arch}-pc-windows-msvc`;
  const crates = rustCrates(triple);
  fillMissingTexts(crates);
  const rustc = execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim();
  const other = [
    {
      name: 'Rust standard library',
      version: rustc.replace(/^rustc\s+/, ''),
      license: 'MIT OR Apache-2.0',
      source: 'https://github.com/rust-lang/rust',
      texts: [MIT('The Rust Project Contributors')],
    },
    {
      name: 'Microsoft WebView2 loader (WebView2LoaderStatic.lib, via webview2-com-sys)',
      version: crates.find((c) => c.name === 'webview2-com-sys')?.version ?? '',
      license: 'BSD-3-Clause',
      source: 'https://www.nuget.org/packages/Microsoft.Web.WebView2',
      texts: [
        BSD3(
          'Microsoft Corporation',
          'The name of Microsoft Corporation, or the names of its contributors\n   may not be used to endorse or promote products derived from this\n   software without specific prior written permission.',
        ),
      ],
    },
  ];
  const sections = [
    ['Rust crates linked into AutoEditorGUI.exe', crates],
    ['JavaScript packages bundled into the user interface', npmPackages()],
    ['Other components', other],
  ];

  // Many packages share a license text word for word; print each text once.
  const ids = new Map();
  const texts = [];
  const textId = (t) => {
    const key = createHash('sha256').update(t.replace(/\r\n/g, '\n').trim()).digest('hex');
    if (!ids.has(key)) {
      ids.set(key, texts.length + 1);
      texts.push(t.replace(/\r\n/g, '\n').trim());
    }
    return ids.get(key);
  };

  const out = [
    'Third-party licenses for AutoEditorGUI.exe',
    '==========================================',
    '',
    'Auto-Editor GUI itself is MIT-licensed (see LICENSE.txt). The program also',
    'contains the open-source components listed below, each under its own license.',
    'Each entry names its license texts by number; the texts follow the list.',
    'All components are unmodified; their source code is available at the',
    'address given for each one (this satisfies, among others, MPL-2.0 §3.2).',
    '',
  ];
  for (const [title, list] of sections) {
    out.push(`${title} (${list.length})`, '-'.repeat(title.length + String(list.length).length + 3));
    for (const c of list) {
      const refs = c.texts.map(textId).map((n) => `#${n}`).join(', ');
      out.push(`${c.name} ${c.version}`, `    License: ${c.license}    Text: ${refs || 'none provided'}`, `    Source:  ${c.source}`);
    }
    out.push('');
  }
  out.push('License texts', '=============', '');
  texts.forEach((t, i) => out.push(`----- #${i + 1} ${'-'.repeat(60)}`, '', t, ''));
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--arch');
  const arch = i >= 0 ? args.splice(i, 2)[1] : 'x86_64';
  const text = buildLicenses({ arch });
  if (args[0]) writeFileSync(args[0], text.replace(/\n/g, '\r\n'));
  else process.stdout.write(text);
}
