import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "runtime-deployment-for-dev",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = (req.url ?? "").split("?")[0];
          if (!/^\/(imd-deployment\.json|abi\/[A-Za-z0-9_]+\.json)$/.test(path))
            return next();
          try {
            const data = await readFile(
              new URL("../dist" + path, import.meta.url),
            );
            res.setHeader("Content-Type", "application/json");
            res.end(data);
          } catch {
            res.statusCode = 503;
            res.end("Run npm run build before starting dev.");
          }
        });
      },
    },
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { react: ["react", "react-dom/client"], chain: ["viem"] },
      },
    },
  },
});
