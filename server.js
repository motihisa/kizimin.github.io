import express from "express";
import pg from "pg";
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";

const app = express();
app.disable("x-powered-by");

// Security headers for this API-only service. CSP is intentionally restrictive because
// this service returns JSON/downloads and does not serve an interactive HTML application.
app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "16kb" }));

const PORT = Number(process.env.PORT || 10000);
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  if (origin && ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(origin && origin === ALLOWED_ORIGIN ? 204 : 403);
  next();
});

app.get("/healthz", async (_req, res) => {
  const env = {
    supabaseUrl: Boolean(SUPABASE_URL),
    supabasePublishableKey: Boolean(SUPABASE_PUBLISHABLE_KEY),
    supabaseDbUrl: Boolean(SUPABASE_DB_URL),
    allowedOrigin: Boolean(ALLOWED_ORIGIN)
  };
  let databaseConnection = false;
  let ownerTableExists = false;
  let databaseError = null;

  if (env.supabaseDbUrl) {
    const checkClient = new pg.Client({
      connectionString: SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000
    });
    try {
      await checkClient.connect();
      databaseConnection = true;
      const check = await checkClient.query(
        "select to_regclass('public.site_owners') as owner_table"
      );
      ownerTableExists = Boolean(check.rows[0]?.owner_table);
    } catch (error) {
      // Never return connection strings or detailed driver errors from a public health endpoint.
      databaseError = error.code || "connection_failed";
    } finally {
      await checkClient.end().catch(() => {});
    }
  }

  const configured = env.supabaseUrl && env.supabasePublishableKey &&
    env.supabaseDbUrl && env.allowedOrigin;
  res.status(configured && databaseConnection && ownerTableExists ? 200 : 503).json({
    ok: Boolean(configured && databaseConnection && ownerTableExists),
    checks: {
      ...env,
      databaseConnection,
      ownerTableExists,
      configured: Boolean(configured)
    },
    databaseError,
    mode: "manual-owner-only-export",
    persistentStorage: false
  });
});

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

async function authenticateOwner(req) {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error("ログインセッションがありません。"), { status: 401 });
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_DB_URL) {
    throw Object.assign(new Error("サーバーの環境変数が未設定です。"), { status: 503 });
  }

  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + token }
  });
  if (!response.ok) throw Object.assign(new Error("Supabaseのログイン確認に失敗しました。"), { status: 401 });
  const user = await response.json();
  if (!user?.id) throw Object.assign(new Error("ログインユーザーを確認できません。"), { status: 401 });

  const client = new pg.Client({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: 60000
  });
  await client.connect();
  try {
    const result = await client.query(
      "select 1 from public.site_owners where user_id = $1 limit 1",
      [user.id]
    );
    if (!result.rowCount) throw Object.assign(new Error("サイトオーナーのみ実行できます。"), { status: 403 });
  } catch (e) {
    if (e.status) throw e;
    throw Object.assign(new Error("サイトオーナー権限を確認できません。"), { status: 403 });
  }
  return { client, userId: user.id };
}

app.post("/api/backup", async (req, res) => {
  let client;
  try {
    const auth = await authenticateOwner(req);
    client = auth.client;
    const startedAt = new Date().toISOString();
    const tablesResult = await client.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"
    );
    const tables = [];
    for (const row of tablesResult.rows) {
      const table = row.table_name;
      const ident = '"' + table.replace(/"/g, '""') + '"';
      const data = await client.query("select * from public." + ident);
      const columns = await client.query(
        "select column_name, data_type, is_nullable, column_default, ordinal_position from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
        [table]
      );
      tables.push({ name: table, columns: columns.rows, rowCount: data.rowCount, rows: data.rows });
    }

    const policies = await client.query(
      "select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname='public' order by tablename, policyname"
    );
    const functions = await client.query(
      "select n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as arguments, pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname"
    );
    const triggers = await client.query(
      "select event_object_table as table_name, trigger_name, action_timing, event_manipulation, action_statement from information_schema.triggers where trigger_schema='public' order by event_object_table, trigger_name"
    );
    const constraints = await client.query(
      "select tc.table_name, tc.constraint_name, tc.constraint_type, pg_get_constraintdef(c.oid) as definition from information_schema.table_constraints tc join pg_constraint c on c.conname=tc.constraint_name join pg_namespace n on n.oid=c.connamespace and n.nspname='public' where tc.table_schema='public' order by tc.table_name, tc.constraint_name"
    );

    const payload = {
      format: "kizimin-json-db-snapshot-v1",
      generatedAt: startedAt,
      generatedBy: auth.userId,
      project: "Kizimin Supabase",
      warning: "データ・列定義・ポリシー・関数・トリガー・制約のスナップショットです。pg_dump形式ではなく、このファイルだけで完全な自動復元はできません。Storageファイル、Auth内部データ、シークレット、拡張機能設定は含みません。",
      tableCount: tables.length,
      rowCount: tables.reduce((sum, t) => sum + t.rowCount, 0),
      tables,
      policies: policies.rows,
      functions: functions.rows,
      triggers: triggers.rows,
      constraints: constraints.rows
    };
    const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { level: 6 });
    const filename = "kizimin-backup-" + startedAt.replace(/[:.]/g, "-") + ".json.gz";
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Backup-Table-Count", String(payload.tableCount));
    res.setHeader("X-Backup-Row-Count", String(payload.rowCount));
    res.setHeader("X-Backup-Id", randomUUID());
    res.status(200).send(compressed);
  } catch (error) {
    const status = error.status || 500;
    console.error("backup_failed", { status, message: error.message });
    if (!res.headersSent) res.status(status).json({ error: status === 500 ? "バックアップの作成に失敗しました。サーバーログを確認してください。" : error.message });
  } finally {
    if (client) await client.end().catch(() => {});
  }
});


app.listen(PORT, "0.0.0.0", () => console.log("Kizimin backup service listening on " + PORT));
