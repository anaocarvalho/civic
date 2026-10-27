// Local dev server: serves /public and runs netlify/functions/* like Netlify does.
// Usage: npm run dev  (reads .env; or use `netlify dev` if you have the Netlify CLI)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url).pathname;
if (existsSync(join(root, '.env'))) {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const port = Number(process.env.PORT) || 8888;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const fn = url.pathname.match(/^\/\.netlify\/functions\/([a-z]+)$/);
  if (fn) {
    const file = join(root, 'netlify/functions', `${fn[1]}.mjs`);
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    const handler = (await import(pathToFileURL(file))).default;
    const out = await handler(new Request(url, { method: req.method }));
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
    return;
  }
  const pub = join(root, 'public');
  let path = normalize(join(pub, url.pathname));
  if (!path.startsWith(pub) || !extname(path) || !existsSync(path)) path = join(pub, 'index.html');
  res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
  res.end(await readFile(path));
}).listen(port, () => console.log(`VoteHub dev server on http://localhost:${port}`));
