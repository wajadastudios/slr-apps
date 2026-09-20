import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

export async function boot({ upTo = "9999" } = {}) {
  const pg = new PGlite();
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
  `);
  const dir = path.resolve(import.meta.dirname, "../../supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const failures = [];
  for (const f of files) {
    if (f.slice(0, 4) > upTo) break;
    try {
      await pg.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      failures.push([f, String(e.message).slice(0, 200)]);
    }
  }
  return { pg, failures };
}
