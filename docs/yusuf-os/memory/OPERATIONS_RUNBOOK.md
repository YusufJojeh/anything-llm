# Yusuf OS V1 local operations runbook

This runbook is for the V1 private deployment only. It does not authorize a
cloud deployment, a browser mutation, or a production update by itself.

## Topology and configuration

- **Core:** one always-on private machine runs the AnythingLLM server, its
  SQLite database, scheduler, audit chain, and durable storage.
- **Models:** the GPU workstation runs Ollama. Configure its private DNS name
  through `OLLAMA_BASE_PATH`; never hardcode a LAN address in code.
- **Operator clients:** tablet, `/os`, and phone only reach the authenticated
  core service. Voice and browser operations retain their existing opt-ins.
- **Browser Broker:** disabled by default. When explicitly enabled, its CDP
  endpoint is loopback-only on the core machine; it attaches to an
  operator-launched Chrome and never starts one.

Start from `server/.env.example`. Keep the real environment file and all
secrets outside source control. `YUSUF_OS_AUDIT_HMAC_KEY` and
`YUSUF_OS_CONTROL_TOKEN` must be distinct random values of at least 32
characters. Loss or replacement of the audit HMAC key prevents verification of
prior audit checkpoints; retain it in the same access-controlled backup system
as the database, but separately from routine application logs.

## Startup and health validation

Before starting or after changing configuration, from `server/` run:

```powershell
npm run yusuf-os:validate
npx prisma validate
npx prisma migrate status
```

The validator is intentionally read-only. It checks secret presence/length
without printing values, scheduler syntax, a credential-free Ollama URL,
loopback-only CDP configuration, and the storage directory. A failure blocks
startup until corrected. Then start with `npm start`; confirm `/os` renders
healthy scheduler state and review server logs for a successful worker tick.

For a remote Ollama workstation, use a private DNS name in `OLLAMA_BASE_PATH`
and set `OLLAMA_AUTH_TOKEN` through the secret store when its proxy requires
authentication. Do not expose Ollama directly to the internet.

## Migration and update procedure

1. Announce a maintenance window and stop new operator-initiated work.
2. Record the current commit and run a verified backup (below).
3. Stop the core process cleanly. Do not run `prisma migrate reset`.
4. Fetch/checkout the approved upstream revision, install its locked
   dependencies, then run `npx prisma migrate deploy` from `server/`.
5. Run the startup validation and focused Yusuf OS regression before starting.
6. Start the service, verify `/os`, audit continuity, scheduler heartbeat, and
   a read-only Ollama health check. Do not perform browser or external actions
   as a smoke test.

If the update fails before migration, return to the recorded commit and restart.
If it fails during or after migration, stop the process, restore the paired
database/storage/audit-key backup, return to the recorded commit, then repeat
the read-only validation. Never attempt an ad-hoc schema downgrade on the live
database.

## Backup and restore

Take backups only while the core process is stopped, so the SQLite database and
storage tree are a consistent pair. Backup these together:

- `server/storage/anythingllm.db` (the current Prisma datasource path is
  hard-coded and is not relocated by `STORAGE_DIR`)
- the complete configured `STORAGE_DIR` tree, including documents, generated
  files, model metadata, keys used by AnythingLLM, and Yusuf OS evidence
- the `YUSUF_OS_AUDIT_HMAC_KEY` in an access-controlled secret backup

Example local procedure (replace the destination with an encrypted, access-
controlled backup volume):

```powershell
# From the repository root, with the core process stopped
$storageSource = if ($env:STORAGE_DIR) { $env:STORAGE_DIR } else { Join-Path $PWD "server\storage" }
Copy-Item -LiteralPath $storageSource -Destination "D:\YusufBackups\storage-YYYYMMDD" -Recurse
Copy-Item -LiteralPath "server\storage\anythingllm.db" -Destination "D:\YusufBackups\anythingllm-YYYYMMDD.db"
Get-FileHash "D:\YusufBackups\anythingllm-YYYYMMDD.db" -Algorithm SHA256
```

Test restoration first on an isolated local directory: stop the test service,
restore the database and storage tree as a matched pair, supply the preserved
audit HMAC key, run `npm run yusuf-os:validate`, `npx prisma migrate status`,
and audit verification/read-only Command Center checks. Only then schedule a
live restore. A live restore requires the core to remain stopped until all
three artifacts are restored; do not merge individual database rows or replace
the HMAC key.

Concrete restore procedure, run from the repository root only after the core
has stopped and the destination has been preserved for incident analysis:

```powershell
$restoreStorage = if ($env:STORAGE_DIR) { $env:STORAGE_DIR } else { Join-Path $PWD "server\storage" }
# Restore the matched storage snapshot, then the separately hashed SQLite file.
Copy-Item -LiteralPath "D:\YusufBackups\storage-YYYYMMDD\*" -Destination $restoreStorage -Recurse -Force
Copy-Item -LiteralPath "D:\YusufBackups\anythingllm-YYYYMMDD.db" -Destination "server\storage\anythingllm.db" -Force
Get-FileHash "server\storage\anythingllm.db" -Algorithm SHA256
```

Supply the preserved `YUSUF_OS_AUDIT_HMAC_KEY` before the first restart. If the
hash or readiness/migration checks fail, keep the core stopped and return to
the preserved pre-restore state instead of starting with a partial restore.

## Logs, shutdown, and recovery

Capture the process supervisor's stdout/stderr as the application log. In a
local process this is the terminal/service log; in containers use the
orchestrator log stream. The durable audit trail is in the SQLite database, not
in stdout. Store operational logs outside `STORAGE_DIR` backups if they contain
host-level data, and never log secret values.

For planned shutdown, first disable inbound operator traffic, wait for active
work to reach a safe checkpoint or expire, stop the core process gracefully,
then verify it has exited before copying backups. On restart, the scheduler
uses its durable lease/worker state and must be checked through `/os` rather
than assumed healthy from process liveness alone.

For an incident, preserve the database, storage tree, current environment
metadata (without printing secrets), and logs before remediation. Recover from
the newest verified backup pair, validate audit continuity using the preserved
HMAC key, and document any gap as an operator incident rather than silently
rewriting evidence.
