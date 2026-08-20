// Shared integration-test database harness; deliberately outside __tests__.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { PrismaClient } = require("@prisma/client");

const GATE_C_MIGRATION = "20260817033000_add_yusuf_os_core";

async function createTestDatabase({ applyGateCSeparately = false } = {}) {
  process.env.YUSUF_OS_AUDIT_HMAC_KEY ||=
    "gate-c-test-audit-key-32-characters-minimum";
  const serverRoot = path.resolve(__dirname, "../..");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "yusuf-os-gate-c-"));
  const databasePath = path.join(tempRoot, "gate-c.db").replace(/\\/g, "/");
  const datasourceUrl = `file:${databasePath}`;
  const migrationsRoot = path.join(serverRoot, "prisma", "migrations");
  const migrationNames = fs
    .readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  // `applyGateCSeparately` proves the Yusuf migrations apply cleanly *on top
  // of* a fully migrated upstream AnythingLLM database. It partitions by
  // ownership rather than by naming a single migration: later Yusuf gates
  // (Gate D's repository binding, Gate E's agent runtime) build on Gate C's
  // tables, so their relative order must be preserved or their table
  // redefinitions have nothing to copy from.
  const isYusufMigration = (name) => name.includes("_add_yusuf_os_");
  const upstream = migrationNames.filter((name) => !isYusufMigration(name));
  const yusufMigrations = migrationNames.filter(isYusufMigration);
  const ordered = applyGateCSeparately
    ? [...upstream, ...yusufMigrations]
    : migrationNames;
  const sqlite = new DatabaseSync(databasePath);
  try {
    sqlite.exec("PRAGMA foreign_keys = ON;");
    for (const migrationName of ordered) {
      const sql = fs.readFileSync(
        path.join(migrationsRoot, migrationName, "migration.sql"),
        "utf8"
      );
      sqlite.exec(sql);
    }
  } catch (error) {
    sqlite.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw new Error(
      `Temporary migration failed while applying SQL directly: ${error.message}`
    );
  }
  sqlite.close();
  const db = new PrismaClient({ datasources: { db: { url: datasourceUrl } } });
  await db.$connect();
  return {
    db,
    databasePath,
    migrationOutput: `Applied ${ordered.length} SQL migrations in order; final migration ${ordered.at(-1)}. Yusuf migrations applied: ${yusufMigrations.join(", ")}.`,
    yusufMigrations,
    async cleanup() {
      await db.$disconnect();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          fs.rmSync(tempRoot, { recursive: true, force: true });
          break;
        } catch (error) {
          if (attempt === 4) throw error;
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * (attempt + 1))
          );
        }
      }
    },
  };
}

async function clearYusufTables(db) {
  // Gate E tables first: they reference runs/tasks/agents.
  await db.yusuf_review_verdicts.deleteMany();
  await db.yusuf_knowledge_entries.deleteMany();
  await db.yusuf_memory_entries.deleteMany();
  await db.yusuf_monitoring_checks.deleteMany();
  await db.yusuf_career_opportunities.deleteMany();
  await db.yusuf_marketing_content.deleteMany();
  await db.yusuf_run_evidence.deleteMany();
  await db.yusuf_handoffs.deleteMany();
  await db.yusuf_project_commands.deleteMany();
  await db.yusuf_action_receipts.deleteMany();
  await db.yusuf_approval_requests.deleteMany();
  await db.yusuf_policy_decisions.deleteMany();
  await db.yusuf_action_intents.deleteMany();
  await db.yusuf_agent_capabilities.deleteMany();
  await db.yusuf_project_policy_overrides.deleteMany();
  await db.yusuf_task_dependencies.deleteMany();
  await db.yusuf_agent_runs.deleteMany();
  await db.yusuf_tasks.deleteMany();
  await db.yusuf_git_repositories.deleteMany();
  await db.yusuf_projects.deleteMany();
  await db.yusuf_agents.deleteMany();
  await db.yusuf_security_settings.deleteMany();
  await db.yusuf_audit_events.deleteMany();
  await db.yusuf_audit_checkpoints.deleteMany();
}

module.exports = { GATE_C_MIGRATION, createTestDatabase, clearYusufTables };
