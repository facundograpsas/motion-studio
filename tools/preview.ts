// Live preview server: http://localhost:5173/films/<name>/  (add ?w=1920&h=1080 for other formats)
// The page plays in a loop with a scrubber; space = pause, ←/→ = ±1 frame, [ ] = ±1s.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..'), PORT = Number(process.env.PORT ?? 5173);
const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.wav': 'audio/wav', '.mp4': 'video/mp4',
};

createServer(async (req, res) => {
  let path = join(ROOT, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
  if (!path.startsWith(ROOT)) return res.writeHead(403).end();
  if (path === ROOT + '/') {
    const films = (await readdir(join(ROOT, 'films'))).filter((f) => !f.startsWith('.'));
    return res.writeHead(200, { 'content-type': 'text/html' }).end(
      `<body style="font:16px system-ui;background:#141413;color:#eee;padding:24px"><h3>films</h3>` +
      films.map((f) => `<p><a style="color:#D97757" href="/films/${f}/">${f}</a> · ` +
        ['9x16:1080x1920', '1x1:1080x1080', '16x9:1920x1080'].map((s) => {
          const [n, wh] = s.split(':'), [w, h] = wh.split('x');
          return `<a style="color:#aaa" href="/films/${f}/?w=${w}&h=${h}">${n}</a>`;
        }).join(' ') + '</p>').join(''));
  }
  if (path.endsWith('/')) path += 'index.html';
  const body = await readFile(path).catch(() => null);
  if (!body) return res.writeHead(404).end();
  // lib/rigs/*.ts: the browser gets the same file with its types erased
  if (extname(path) === '.ts') return res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }).end(stripTypeScriptTypes(body.toString()));
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
}).listen(PORT, () => console.log(`preview → http://localhost:${PORT}/`));
