const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

// Environment variable names copied verbatim from the parent process. Chosen
// because Git/its OS loader need them to resolve and execute the binary, not
// because they matter to Git's own behavior — everything Git-behavior-related
// is set explicitly below instead of inherited. Nothing provider-secret-shaped
// (API keys, the audit HMAC key, tokens) is on this list, and this is an
// allowlist rather than a denylist so a newly-added server secret is excluded
// by default rather than by omission.
const INHERITED_ENV_ALLOWLIST = [
  "PATH",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "COMSPEC",
  "PATHEXT",
  "TEMP",
  "TMP",
  "WINDIR",
];

let isolationRoot = null;
function ensureIsolationDirs() {
  if (isolationRoot) return isolationRoot;
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "yusuf-os-git-isolation-")
  );
  const home = path.join(root, "home");
  const hooks = path.join(root, "no-hooks");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(hooks, { recursive: true });
  const globalConfig = path.join(home, ".gitconfig-empty");
  fs.writeFileSync(globalConfig, "");
  isolationRoot = { home, hooks, globalConfig };
  return isolationRoot;
}

/**
 * Config overrides applied to every governed invocation, ahead of the
 * subcommand, so a value baked into the target repository's own tracked or
 * local `.git/config` (hooksPath, credential helper, external diff/textconv,
 * pager, fsmonitor) can never re-enable something this adapter disabled.
 * `-c` flags take precedence over repository config for the life of the
 * single invocation without mutating any file on disk.
 */
function hardenedConfigArgs() {
  const { hooks } = ensureIsolationDirs();
  return [
    "-c",
    `core.hooksPath=${hooks}`,
    "-c",
    "credential.helper=",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "diff.external=",
    "-c",
    "core.pager=cat",
    "-c",
    "protocol.file.allow=always",
  ];
}

function minimalEnv() {
  const { home, globalConfig } = ensureIsolationDirs();
  const env = { GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" };
  for (const key of INHERITED_ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  // Isolates the invocation from Yusuf's real ~/.gitconfig (custom aliases,
  // a credential helper, includeIf directives) without touching it.
  env.HOME = home;
  env.USERPROFILE = home;
  env.GIT_CONFIG_GLOBAL = globalConfig;
  return env;
}

/**
 * Runs one Git subcommand with a fixed executable, an argument array (never
 * a shell string), a bounded timeout/output size, and a minimal environment.
 * Never resolves with a shell-truthy exit; callers get an explicit
 * {exitCode, stdout, stderr} and decide what a non-zero code means for their
 * operation (a clean pre-effect rejection vs. an uncertain outcome).
 */
function runGit({
  args,
  cwd,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowNetwork = false,
} = {}) {
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Git invocation arguments must be an array of strings.",
      { status: 422 }
    );
  if (!cwd || typeof cwd !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Git invocation requires an explicit working directory.",
      { status: 422 }
    );

  const fullArgs = ["--no-pager", ...hardenedConfigArgs(), ...args];
  const env = minimalEnv();
  if (!allowNetwork) env.GIT_ALLOW_PROTOCOL = "file";

  return new Promise((resolve, reject) => {
    execFile(
      "git",
      fullArgs,
      {
        cwd,
        shell: false,
        windowsHide: true,
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: MAX_BUFFER_BYTES,
        env,
      },
      (error, stdout, stderr) => {
        if (error && error.killed)
          return reject(
            Object.assign(
              new Error(
                `Git command timed out or was killed: ${args[0] || ""}`
              ),
              { effectCertain: false, timedOut: true }
            )
          );
        if (error && typeof error.code !== "number")
          return reject(
            Object.assign(
              new Error(`Git executable could not be run: ${error.message}`),
              { effectCertain: true, spawnFailure: true }
            )
          );
        resolve({
          exitCode: error ? error.code : 0,
          stdout: stdout ? stdout.toString("utf8") : "",
          stderr: stderr ? stderr.toString("utf8") : "",
        });
      }
    );
  });
}

async function assertGitAvailable() {
  try {
    const result = await runGit({
      args: ["--version"],
      cwd: os.tmpdir(),
      timeoutMs: 5000,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  INHERITED_ENV_ALLOWLIST,
  runGit,
  assertGitAvailable,
  ensureIsolationDirs,
  minimalEnv,
  hardenedConfigArgs,
};
