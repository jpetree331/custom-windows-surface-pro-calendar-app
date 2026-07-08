// RLS proof: user B must NOT be able to read (or write) user A's rows.
// Needs a live Supabase project + two test users. Reads env from .env.local.
//   npm run test:rls
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const { RLS_TEST_EMAIL_A, RLS_TEST_PASSWORD_A, RLS_TEST_EMAIL_B, RLS_TEST_PASSWORD_B } =
  process.env;

if (!url || !anon || !RLS_TEST_EMAIL_A || !RLS_TEST_EMAIL_B) {
  console.log("SKIP: Supabase env vars not configured (see .env.example). RLS test needs a live project.");
  process.exit(0);
}

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

const a = createClient(url, anon);
const { error: loginA } = await a.auth.signInWithPassword({
  email: RLS_TEST_EMAIL_A,
  password: RLS_TEST_PASSWORD_A,
});
if (loginA) fail(`user A login: ${loginA.message}`);

const plannerId = crypto.randomUUID();
const { error: insErr } = await a
  .from("planners")
  .insert({ id: plannerId, year: 2099, title: "rls-test" });
if (insErr) fail(`user A insert: ${insErr.message}`);

const b = createClient(url, anon);
const { error: loginB } = await b.auth.signInWithPassword({
  email: RLS_TEST_EMAIL_B,
  password: RLS_TEST_PASSWORD_B,
});
if (loginB) fail(`user B login: ${loginB.message}`);

const { data: rows, error: readErr } = await b.from("planners").select("*").eq("id", plannerId);
if (readErr) fail(`user B read errored unexpectedly: ${readErr.message}`);
if (rows.length !== 0) fail(`user B can read user A's planner — RLS BROKEN`);

const { error: updErr, data: updRows } = await b
  .from("planners")
  .update({ title: "hacked" })
  .eq("id", plannerId)
  .select();
if (!updErr && updRows.length > 0) fail("user B can update user A's planner — RLS BROKEN");

await a.from("planners").delete().eq("id", plannerId);
console.log("PASS: cross-owner read returned 0 rows; cross-owner update affected 0 rows.");
