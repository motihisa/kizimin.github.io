import express from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);

// Never expose server-side/configuration files from the repository root.
const blocked = [
  /^\/(?:server|scripts|site-server)\.js$/i,
  /^\/(?:package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|render\.yaml)$/i,
  /^\/(?:supabase|workers|\.github|\.git)(?:\/|$)/i,
  /^\/\.env(?:\.|$)/i,
  /\.(?:md|sql|ya?ml|toml|lock|map|ts|sh|log)$/i,
];

app.disable("x-powered-by");

// Apply baseline browser security headers to pages, errors, and health checks.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

app.use((req, res, next) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.originalUrl, "http://localhost").pathname);
  } catch {
    return res.status(400).send("不正なリクエストです。");
  }
  if (blocked.some((pattern) => pattern.test(pathname))) {
    return res.status(404).send("ページが見つかりません。");
  }
  next();
});

app.use(express.static(root, {
  dotfiles: "deny",
  index: "index.html",
  fallthrough: true,
  setHeaders(res, filePath) {
    if (/\.html$/i.test(filePath)) {
      // Avoid caching HTML pages that may reflect changing account/session state.
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));

app.use((_req, res) => res.status(404).send("ページが見つかりません。"));

// Best-effort bot runner on this existing free web service.
 // Render Cron Jobs require a paid plan, so run the worker only while this
 // service instance is awake. It remains fail-closed if the service key is absent.
let botChild = null;
function runBotWorker() {
  if (String(process.env.BOT_ENABLED || "true").toLowerCase() !== "true") return;
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("Kizimin bot worker skipped: SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) is not configured.");
    return;
  }
  if (botChild) {
    console.log("Kizimin bot worker skipped: previous run is still active.");
    return;
  }
  botChild = spawn(process.execPath, [path.join(root, "scripts/kizimin-bot-worker.mjs")], {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"]
  });
  botChild.on("error", (error) => console.error("Kizimin bot worker launch failed:", error.message));
  botChild.on("close", (code) => {
    console.log(`Kizimin bot worker finished with code ${code}`);
    botChild = null;
  });
}
app.listen(port, "0.0.0.0", () => {
  console.log(`Kizimin site server listening on port ${port}`);
  runBotWorker();
  setInterval(runBotWorker, 15 * 60 * 1000);
});
