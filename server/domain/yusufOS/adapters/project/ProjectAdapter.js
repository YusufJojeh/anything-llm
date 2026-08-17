const fs = require("fs");
const path = require("path");
const prisma = require("../../../../utils/prisma");
const { GovernedAdapter } = require("../../execution/AdapterContract");
const { canonicalHash, sha256 } = require("../../security/canonicalJson");
const {
  resolveBoundRepository,
  assertRepositoryMatchesTask,
} = require("../localGit/repositoryIdentity");
const { resolveWithinRoot } = require("../localGit/pathPolicy");
const { resolveProjectCommand } = require("./commandRegistry");
const { runProjectCommand } = require("./processRunner");

const CAPABILITIES = Object.freeze([
  "project.read_file",
  "project.write_file",
  "project.run_command",
]);

const MAX_FILE_BYTES = 512 * 1024;

function certainFailure(message) {
  return Object.assign(new Error(message), { effectCertain: true });
}

function fileDigest(absolutePath) {
  if (!fs.existsSync(absolutePath)) return "ABSENT";
  return sha256(fs.readFileSync(absolutePath));
}

/**
 * Governed project-file and project-command adapter.
 *
 * Deliberately NOT a general filesystem agent: every path is resolved through
 * the same Gate D `resolveWithinRoot` policy that guards `git.stage_paths`
 * (project-root scoped, traversal/symlink/junction safe, protected-secret
 * paths and directories denied), and every command comes from a
 * project-registered, server-owned row rather than a model-supplied string.
 */
class ProjectAdapter extends GovernedAdapter {
  constructor({ db = prisma } = {}) {
    super();
    this.db = db;
  }

  descriptor() {
    return {
      id: "project-local",
      kind: "PROJECT_LOCAL",
      capabilities: CAPABILITIES,
    };
  }

  async availability() {
    return { status: "AVAILABLE", account: null };
  }

  async preflight(intentSnapshot) {
    const target = JSON.parse(intentSnapshot.canonicalTarget || "{}");
    const repository = await resolveBoundRepository(
      target.repositoryId,
      this.db
    );
    await assertRepositoryMatchesTask(repository, intentSnapshot, this.db);
    // For a file write the "resource version" is the current on-disk digest of
    // the exact file being replaced: if anything else edits that file between
    // intent creation and execution, the bound approval/authorization no
    // longer describes reality and Gate C invalidates it for us.
    let resourceVersion = intentSnapshot.resourceVersion;
    if (target.relativePath) {
      const { absolutePath } = resolveWithinRoot(
        repository.canonicalRoot,
        target.relativePath,
        "relativePath"
      );
      resourceVersion = fileDigest(absolutePath);
    }
    return {
      accountIdentity: null,
      resourceVersion,
      targetIdentityDigest: canonicalHash({
        resource: {
          type: intentSnapshot.resourceType,
          id: intentSnapshot.resourceId,
          version: intentSnapshot.resourceVersion,
        },
        target,
      }),
    };
  }

  async prepare(intent) {
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const repository = await resolveBoundRepository(
      target.repositoryId,
      this.db
    );
    await assertRepositoryMatchesTask(repository, intent, this.db);
    return {
      capabilityKey: intent.capabilityKey,
      repository,
      target,
      payload: JSON.parse(intent.canonicalPayload || "{}"),
      projectId: repository.projectId,
    };
  }

  async execute(prepared) {
    const { capabilityKey, repository, target, payload, projectId } = prepared;
    const root = repository.canonicalRoot;
    try {
      switch (capabilityKey) {
        case "project.read_file": {
          const { absolutePath } = resolveWithinRoot(
            root,
            target.relativePath,
            "relativePath"
          );
          if (!fs.existsSync(absolutePath))
            throw certainFailure(`File not found: ${target.relativePath}`);
          const stat = fs.statSync(absolutePath);
          if (stat.size > MAX_FILE_BYTES)
            throw certainFailure("File exceeds the governed read size limit.");
          return {
            outcome: "SUCCEEDED",
            result: {
              relativePath: target.relativePath,
              contents: fs.readFileSync(absolutePath, "utf8"),
              digest: fileDigest(absolutePath),
            },
          };
        }
        case "project.write_file": {
          const { absolutePath } = resolveWithinRoot(
            root,
            target.relativePath,
            "relativePath"
          );
          const contents = payload.contents;
          if (typeof contents !== "string")
            throw certainFailure("contents must be a string.");
          if (Buffer.byteLength(contents, "utf8") > MAX_FILE_BYTES)
            throw certainFailure(
              "contents exceeds the governed write size limit."
            );
          const beforeDigest = fileDigest(absolutePath);
          // Write to a sibling temp file and rename, so a crash mid-write
          // cannot leave the project holding a half-written file.
          const tempPath = `${absolutePath}.yusuf-tmp-${process.pid}`;
          fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
          fs.writeFileSync(tempPath, contents, "utf8");
          fs.renameSync(tempPath, absolutePath);
          const afterDigest = fileDigest(absolutePath);
          return {
            outcome: "SUCCEEDED",
            externalReference: `file:${target.relativePath}@${afterDigest.slice(0, 12)}`,
            result: {
              relativePath: target.relativePath,
              beforeDigest,
              afterDigest,
              bytesWritten: Buffer.byteLength(contents, "utf8"),
            },
          };
        }
        case "project.run_command": {
          const command = await resolveProjectCommand(
            projectId,
            payload.commandKey,
            this.db
          );
          // cwdRelative comes from the trusted row, but it is still resolved
          // through the same root-containment check rather than trusted
          // outright — defense in depth against a bad registration.
          const cwd =
            command.cwdRelative === "."
              ? root
              : resolveWithinRoot(root, command.cwdRelative, "cwdRelative")
                  .absolutePath;
          const result = await runProjectCommand({
            executable: command.executable,
            args: command.args,
            cwd,
            timeoutMs: command.timeoutMs,
          });
          return {
            outcome: "SUCCEEDED",
            externalReference: `command:${command.key}`,
            result: {
              commandKey: command.key,
              exitCode: result.exitCode,
              passed: result.exitCode === 0,
              stdout: result.stdout,
              stderr: result.stderr,
            },
          };
        }
        default:
          throw certainFailure(
            `Unsupported project capability: ${capabilityKey}`
          );
      }
    } catch (error) {
      if (error.effectCertain !== undefined) throw error;
      // A path-policy rejection is a clean refusal that definitely applied
      // nothing; anything else unclassified stays conservative (unknown).
      if (
        error.code === "ACTION_FORBIDDEN" ||
        error.code === "VALIDATION_ERROR"
      )
        throw Object.assign(error, { effectCertain: true });
      throw Object.assign(error, { effectCertain: false });
    }
  }

  async verify(intent, executionResult) {
    const target = JSON.parse(intent.canonicalTarget || "{}");
    switch (intent.capabilityKey) {
      case "project.read_file":
      case "project.run_command":
        // Reads and command runs have no external state to re-prove; the
        // receipt itself is the artifact. A non-zero exit code is recorded
        // faithfully as evidence, not reinterpreted as adapter failure.
        return { status: "VERIFIED", result: {}, evidence: [] };
      case "project.write_file": {
        let repository;
        try {
          repository = await resolveBoundRepository(
            target.repositoryId,
            this.db
          );
        } catch {
          return { status: "UNKNOWN", result: {}, evidence: [] };
        }
        const { absolutePath } = resolveWithinRoot(
          repository.canonicalRoot,
          target.relativePath,
          "relativePath"
        );
        const actual = fileDigest(absolutePath);
        const expected = executionResult?.result?.afterDigest;
        return actual === expected
          ? {
              status: "VERIFIED",
              result: { digest: actual },
              evidence: [{ type: "file-digest", digest: actual }],
            }
          : { status: "NOT_APPLIED", result: { digest: actual }, evidence: [] };
      }
      default:
        return { status: "UNKNOWN", result: {}, evidence: [] };
    }
  }

  async reconcile(intent) {
    if (intent.capabilityKey !== "project.write_file")
      return { status: "NOT_APPLIED" };
    const target = JSON.parse(intent.canonicalTarget || "{}");
    const repository = await resolveBoundRepository(
      target.repositoryId,
      this.db
    );
    const { absolutePath } = resolveWithinRoot(
      repository.canonicalRoot,
      target.relativePath,
      "relativePath"
    );
    const payload = JSON.parse(intent.canonicalPayload || "{}");
    const expected =
      typeof payload.contents === "string" ? sha256(payload.contents) : null;
    return {
      status:
        expected && fileDigest(absolutePath) === expected
          ? "VERIFIED"
          : "NOT_APPLIED",
    };
  }
}

module.exports = { ProjectAdapter, CAPABILITIES, MAX_FILE_BYTES };
