import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// PORT = API port (default 8787), WEB_PORT = this dev server (default 5199).
const apiPort = Number(process.env.PORT ?? 8787);
const webPort = Number(process.env.WEB_PORT ?? 5199);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${apiPort}` },
  },
});
