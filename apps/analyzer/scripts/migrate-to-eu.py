"""
One-off migration: Singapore Supabase project → Frankfurt Supabase project.

Uses the Supabase Management API SQL endpoint (no DB password needed for setup).
Runs in three phases:
  1. Apply schemas on the new project (portal + analyzer migrations)
  2. Copy data (auth.users + public.* + analyzer.*) in FK-safe order
  3. Verify row counts match

Required env:
  SUPABASE_ACCESS_TOKEN  — personal access token (apps/analyzer/.env)

Usage:
  python scripts/migrate-to-eu.py
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

OLD_REF = "wgrtzrquymiwmflxaitj"
NEW_REF = "jcpydyoewnzandqsmisj"

# Resolve repo paths
ANALYZER_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = ANALYZER_DIR.parent.parent

# Load access token from .env
def load_token() -> str:
    env = (ANALYZER_DIR / ".env").read_text(encoding="utf-8")
    m = re.search(r"^SUPABASE_ACCESS_TOKEN=(.+)$", env, re.M)
    if not m:
        raise RuntimeError("SUPABASE_ACCESS_TOKEN missing in apps/analyzer/.env")
    return m.group(1).strip()

TOKEN = load_token()

def sql(ref: str, query: str, *, retries: int = 3):
    """Run a SQL statement via Supabase Management API; return list of rows."""
    body = json.dumps({"query": query}).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            # Cloudflare WAF rejects Python-urllib UA → present as curl.
            "User-Agent": "curl/8.5.0",
        },
    )
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", errors="replace")
            if attempt == retries - 1:
                raise RuntimeError(f"HTTP {e.code} on {ref}: {text}\nQuery snippet: {query[:200]}")
            time.sleep(2)
        except urllib.error.URLError:
            if attempt == retries - 1:
                raise
            time.sleep(2)

def pg_literal(v):
    """Format a Python value as a Postgres literal."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        # jsonb / array
        s = json.dumps(v, ensure_ascii=False).replace("'", "''")
        return f"'{s}'"
    # str — escape single quotes
    s = str(v).replace("'", "''")
    return f"'{s}'"

def build_insert(schema: str, table: str, rows: list[dict], *, quote_table: bool = False) -> str:
    if not rows:
        return ""
    qtable = f'"{table}"' if quote_table else table
    cols = list(rows[0].keys())
    quoted_cols = [f'"{c}"' for c in cols]
    col_list = ", ".join(quoted_cols)
    values_parts = []
    for r in rows:
        vals = ", ".join(pg_literal(r.get(c)) for c in cols)
        values_parts.append(f"({vals})")
    return (
        f"INSERT INTO {schema}.{qtable} ({col_list}) VALUES "
        + ",\n".join(values_parts)
        + " ON CONFLICT DO NOTHING;"
    )

def fetch_all(ref: str, schema: str, table: str, *, quote_table: bool = False) -> list[dict]:
    qtable = f'"{table}"' if quote_table else table
    return sql(ref, f"SELECT * FROM {schema}.{qtable}") or []

def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def copy_table(schema: str, table: str, *, quote: bool = False, batch: int = 200):
    rows = fetch_all(OLD_REF, schema, table, quote_table=quote)
    if not rows:
        print(f"  {schema}.{table}: empty, skip")
        return
    total = len(rows)
    inserted = 0
    for chunk in chunked(rows, batch):
        stmt = "BEGIN; SET LOCAL session_replication_role = replica; " + build_insert(schema, table, chunk, quote_table=quote) + " COMMIT;"
        sql(NEW_REF, stmt)
        inserted += len(chunk)
        print(f"  {schema}.{table}: {inserted}/{total}", end="\r")
    print(f"  {schema}.{table}: {inserted} rows OK                  ")

def apply_sql_file(path: Path):
    print(f"  applying {path.name}...")
    content = path.read_text(encoding="utf-8")
    # Send the whole file as one batch; Postgres parses multi-statement strings.
    sql(NEW_REF, content)

# --------------------------------------------------------------------
# Phase 1 — apply schemas on new project
# --------------------------------------------------------------------

def phase_schemas():
    print("=== Phase 1: applying schemas to NEW project ===")
    portal_files = [
        REPO_ROOT / "supabase" / "schema.sql",
        REPO_ROOT / "supabase" / "migration_001_add_currency.sql",
        REPO_ROOT / "supabase" / "migration_002_strategy_tasks.sql",
        REPO_ROOT / "supabase" / "migration_003_quality_snapshot.sql",
    ]
    for p in portal_files:
        if p.exists():
            apply_sql_file(p)
        else:
            print(f"  WARN: missing {p}")

    print("  creating analyzer schema...")
    sql(NEW_REF, 'CREATE SCHEMA IF NOT EXISTS analyzer;')

    analyzer_migrations = sorted((ANALYZER_DIR / "prisma" / "migrations").glob("*/migration.sql"))
    for p in analyzer_migrations:
        apply_sql_file(p)

# --------------------------------------------------------------------
# Phase 2 — copy data (FK-safe order)
# --------------------------------------------------------------------

# Auth users have special handling (different schema)
def copy_auth_users():
    print("  copying auth.users (preserving password hashes)...")
    users = sql(OLD_REF, "SELECT * FROM auth.users")
    if not users:
        print("  auth.users: empty, skip")
        return
    # Whitelist columns that exist on Supabase auth.users for both projects.
    keep = [
        "instance_id", "id", "aud", "role", "email",
        "encrypted_password", "email_confirmed_at", "invited_at",
        "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at",
        "email_change_token_new", "email_change", "email_change_sent_at",
        "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data",
        "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at",
        "phone_change", "phone_change_token", "phone_change_sent_at",
        # "confirmed_at" is a generated column — excluded
        "email_change_token_current",
        "email_change_confirm_status", "banned_until", "reauthentication_token",
        "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous",
    ]
    filtered = []
    for u in users:
        filtered.append({k: u.get(k) for k in keep if k in u})
    stmt = "BEGIN; SET LOCAL session_replication_role = replica; " + \
        build_insert("auth", "users", filtered) + " COMMIT;"
    sql(NEW_REF, stmt)
    print(f"  auth.users: {len(filtered)} rows OK")

def sync_columns(schema: str):
    """For each table in OLD `schema`, add any columns missing in NEW.
    Schema.sql drifted from reality — Sharon added columns via the Dashboard,
    so we reconcile here before inserting data.
    """
    print(f"  syncing columns in {schema} schema...")
    cols_q = f"""
        SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
               character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = '{schema}'
        ORDER BY table_name, ordinal_position
    """
    old_cols = sql(OLD_REF, cols_q) or []
    new_cols = sql(NEW_REF, cols_q) or []

    new_set = {(c["table_name"], c["column_name"]) for c in new_cols}
    new_tables = {c["table_name"] for c in new_cols}

    by_table = {}
    for c in old_cols:
        by_table.setdefault(c["table_name"], []).append(c)

    for table, cols in by_table.items():
        if table not in new_tables:
            # Table doesn't exist at all in NEW; skip — will be reported as missing.
            print(f"    SKIP table {schema}.{table} (not in NEW)")
            continue
        adds = []
        for col in cols:
            if (table, col["column_name"]) in new_set:
                continue
            # Build type spec
            udt = col.get("udt_name") or ""
            if udt in ("varchar", "bpchar") and col.get("character_maximum_length"):
                tspec = f"{udt}({col['character_maximum_length']})"
            elif udt == "numeric" and col.get("numeric_precision"):
                if col.get("numeric_scale"):
                    tspec = f"numeric({col['numeric_precision']},{col['numeric_scale']})"
                else:
                    tspec = f"numeric({col['numeric_precision']})"
            else:
                tspec = udt
            nullable = "" if col["is_nullable"] == "YES" else " NOT NULL"
            default = ""
            if col.get("column_default"):
                default = f" DEFAULT {col['column_default']}"
            adds.append(f'ADD COLUMN IF NOT EXISTS "{col["column_name"]}" {tspec}{default}{nullable}')
        if adds:
            stmt = f'ALTER TABLE {schema}."{table}" ' + ", ".join(adds) + ";"
            try:
                sql(NEW_REF, stmt)
                print(f"    {schema}.{table}: +{len(adds)} column(s)")
            except Exception as e:
                print(f"    WARN {schema}.{table}: {e}")

def phase_data():
    print("\n=== Phase 2: copying data (analyzer-focused) ===")
    copy_auth_users()

    print("--- public minimum (just admin_users for analyzer gate) ---")
    # Only the table the analyzer's middleware reads. Portal stays on the
    # old Singapore project for now; full migration is a follow-up session.
    copy_table("public", "admin_users")

    print("--- analyzer.* ---")
    # Different per-table batch sizes — Finding payloads can be ~1MB each,
    # GscDailyRow is light but huge in count.
    analyzer_tables = [
        ("Client", 200),
        ("Scan", 200),
        ("Finding", 1),         # heavy JSON payloads (~1MB each)
        ("GscAccount", 200),
        ("GscDailyRow", 500),   # light rows, many of them
    ]
    for t, b in analyzer_tables:
        copy_table("analyzer", t, quote=True, batch=b)

# --------------------------------------------------------------------
# Phase 3 — verify counts
# --------------------------------------------------------------------

def phase_verify():
    print("\n=== Phase 3: verifying row counts ===")
    print(f"{'schema.table':40s} {'old':>10s} {'new':>10s}  match?")
    for schema, table, quote in [
        ("auth", "users", False),
        ("public", "admin_users", False),
        ("analyzer", "Client", True),
        ("analyzer", "Scan", True),
        ("analyzer", "Finding", True),
        ("analyzer", "GscAccount", True),
        ("analyzer", "GscDailyRow", True),
    ]:
        qtable = f'"{table}"' if quote else table
        try:
            o = sql(OLD_REF, f"SELECT count(*)::int AS n FROM {schema}.{qtable}")[0]["n"]
            n = sql(NEW_REF, f"SELECT count(*)::int AS n FROM {schema}.{qtable}")[0]["n"]
            mark = "OK" if o == n else "FAIL"
            print(f"{schema + '.' + table:40s} {o:>10d} {n:>10d}  {mark}")
        except Exception as e:
            print(f"{schema + '.' + table:40s} ERROR: {e}")

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or "schemas" in args:
        phase_schemas()
    if not args or "data" in args:
        phase_data()
    if not args or "verify" in args:
        phase_verify()
    print("\nDone.")
