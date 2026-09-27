import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
export async function preview(root) {
  const dist = resolve(root, "dist");
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(
        new URL(req.url, "http://local").pathname,
      );
      if (!path.startsWith("/preview/")) {
        res.writeHead(404).end();
        return;
      }
      const file = resolve(
        dist,
        path.slice("/preview/".length) || "index.html",
      );
      if (!file.startsWith(dist + "/") || !(await stat(file)).isFile()) {
        res.writeHead(404).end();
        return;
      }
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
      };
      res.writeHead(200, {
        "content-type": types[extname(file)] ?? "application/octet-stream",
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, "0.0.0.0", r));
  return { server, url: `http://127.0.0.1:${server.address().port}/preview/` };
}
