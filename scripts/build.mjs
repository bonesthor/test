// Bundle the app into a single self-contained HTML file.
//   dist/index.html      — a complete document; open it straight from disk.
//   dist/fragment.html   — the same page without <html>/<head>/<body>, for
//                          hosts (like Claude artifacts) that supply their own.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

const result = await build({
  entryPoints: [new URL('src/ui/main.js', root).pathname],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2022',
  write: false,
  legalComments: 'none',
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const styles = await read('src/ui/styles.css');
const template = await read('src/ui/template.html');

const page = template
  .replace('/*STYLES*/', () => styles)
  .replace('/*SCRIPT*/', () => script);

const split = page.indexOf('<div class="app">');
const head = page.slice(0, split).trim();
const body = page.slice(split).trim();
const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
${head}
</head>
<body>
${body}
</body>
</html>
`;

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/index.html', root), full);
await writeFile(new URL('dist/fragment.html', root), page);
console.log(`dist/index.html  ${(full.length / 1024).toFixed(1)} KB`);
