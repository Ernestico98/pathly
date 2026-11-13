import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { createApp } from "./app";
import { Db } from "./db";
import { Repo } from "./repo";

const DB_FILE = path.resolve(process.env.PATHLY_DB ?? "data/pathly.db");
const PORT = Number(process.env.PORT ?? 8787);

const db = await Db.open(DB_FILE);
const repo = new Repo(db);

const root = new Hono();
root.route("/", createApp(repo));

// In production, serve the built SPA from dist/.
if (process.env.NODE_ENV === "production" && fs.existsSync("dist")) {
  root.use("/*", serveStatic({ root: "./dist" }));
  root.get("*", serveStatic({ path: "./dist/index.html" }));
}

const server = serve({ fetch: root.fetch, port: PORT, hostname: "127.0.0.1" }, ({ port }) => {
  console.log(`Pathly API → http://127.0.0.1:${port}  (db: ${DB_FILE})`);
});
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\n✗ Port ${PORT} is already in use (another Pathly instance?).\n` +
        `  See who's using it:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN\n` +
        `  Or pick another:     PORT=8790 pnpm dev   (the web app follows)\n`,
    );
    process.exit(1);
  }
  throw err;
});
