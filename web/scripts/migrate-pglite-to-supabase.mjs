import { readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

// Parents come before children so PostgreSQL can check every foreign key as
// each batch is inserted. The source database is only read, never changed.
const tables = [
  "events", "demo_accounts", "protected_people", "simulation_runs",
  "demo_current_event", "rate_limit_buckets", "protected_invitations",
  "protected_credentials", "queue_entries", "reservations", "orders",
  "idempotency_records", "demo_run_policies", "demo_actors",
  "demo_challenges", "audit_events",
];
const planOnly = process.argv.includes("--plan");
const sourceDir = path.resolve(process.env.PGLITE_DATA_DIR || ".data/pglite");

function localDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return readFile(".env.local", "utf8").then((contents) => {
    const line = contents.split(/\r?\n/).find((item) => item.startsWith("DATABASE_URL="));
    const value = line?.slice("DATABASE_URL=".length).trim() || "";
    return value.replace(/^['"]|['"]$/g, "");
  }).catch(() => "");
}

const source = new PGlite(sourceDir);
let target;
try {
  const counts = new Map();
  const columnsByTable = new Map();
  for (const table of tables) {
    const result = await source.query(`SELECT count(*)::integer AS n FROM ${table}`);
    counts.set(table, Number(result.rows[0].n));
    const columns = (await source.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table])).rows.map((row) => row.column_name);
    if (!columns.length) throw new Error(`Could not inspect local table ${table}`);
    columnsByTable.set(table, columns);
  }
  console.log(`Local source: ${sourceDir}`);
  for (const [table, count] of counts) console.log(`  ${table}: ${count}`);
  if (planOnly) {
    console.log("Plan only. No Supabase connection or writes were made.");
    process.exitCode = 0;
  } else {
    const connectionString = await localDatabaseUrl();
    if (!connectionString) throw new Error("Set DATABASE_URL in web/.env.local before migrating.");
    const url = new URL(connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !(url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".pooler.supabase.com")))
      throw new Error("DATABASE_URL must be a Supabase PostgreSQL connection string.");
    if (!url.searchParams.has("sslmode"))
      throw new Error("Add ?sslmode=require to the Supabase connection string.");
    target = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
    await target.connect();
    // Refuse an occupied destination; the script never deletes existing data.
    for (const table of tables) {
      const exists = (await target.query("SELECT to_regclass($1) AS name", [`public.${table}`])).rows[0].name;
      if (exists) {
        const count = Number((await target.query(`SELECT count(*)::integer AS n FROM public.${table}`)).rows[0].n);
        if (count) throw new Error(`Supabase table ${table} already contains data. Use an empty Fair Drop database.`);
      }
    }
    await target.query("BEGIN");
    try {
      await target.query(await readFile("db/schema.sql", "utf8"));
      // Supabase exposes public tables through its Data API. The app uses a
      // private server connection, so anon and authenticated need no grants.
      await target.query(await readFile("db/supabase-private.sql", "utf8"));
      for (const table of tables) {
        const columns = columnsByTable.get(table);
        const rows = (await source.query(`SELECT * FROM ${table}`)).rows;
        for (let offset = 0; offset < rows.length; offset += 100) {
          const batch = rows.slice(offset, offset + 100);
          const values = batch.flatMap((row) => columns.map((column) => row[column]));
          const tuples = batch.map((_, rowIndex) => `(${columns.map((_, columnIndex) =>
            `$${rowIndex * columns.length + columnIndex + 1}`).join(",")})`).join(",");
          await target.query(`INSERT INTO public.${table} (${columns.join(",")}) VALUES ${tuples}`, values);
        }
        const copied = Number((await target.query(`SELECT count(*)::integer AS n FROM public.${table}`)).rows[0].n);
        if (copied !== counts.get(table)) throw new Error(`Count mismatch for ${table}: ${copied} copied, ${counts.get(table)} local`);
        console.log(`Copied ${table}: ${copied}`);
      }
      const unbalanced = Number((await target.query(`SELECT count(*)::integer AS n FROM events
        WHERE available + reserved + sold <> total_inventory`)).rows[0].n);
      if (unbalanced) throw new Error(`${unbalanced} events failed the inventory balance check`);
      const exposed = (await target.query(`SELECT relname FROM pg_class WHERE relname = ANY($1::text[])
        AND relnamespace='public'::regnamespace AND NOT relrowsecurity`, [tables])).rows;
      if (exposed.length) throw new Error(`RLS missing on ${exposed.map((row) => row.relname).join(", ")}`);
      await target.query("COMMIT");
      console.log("Migration committed. Local PGlite data remains untouched. Restart the app to use Supabase.");
    } catch (error) { await target.query("ROLLBACK"); throw error; }
  }
} catch (error) {
  // Do not print connection strings or credentials in error output.
  console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL]") : "Migration failed");
  process.exitCode = 1;
} finally {
  await target?.end();
  await source.close();
}
