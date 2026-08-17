const { execFile } = require("child_process");
const { assertAllowedExecutable } = require("./commandRegistry");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");

const MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const MAX_CAPTURED_CHARS = 20000;

// Same allowlist philosophy as the Gate D git runner: name exactly what the
// OS loader needs to find and start a binary, and nothing else. No provider
// API keys, no audit HMAC key, no control-plane token, no DATABASE_URL. An
// allowlist (not a denylist) means a newly-added server secret is excluded by
// default rather than by remembering to exclude it.
const INHERITED_ENV_ALLOWLIST = [
  "PATH",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "PATHEXT",
  "WINDIR",
  "TEMP",
  "TMP",
];

function minimalEnv() {
  const env = {
    NODE_ENV: "test",
    CI: "1",
    // Keeps a child `node` from inheriting the parent's --require/--loader
    // hooks, which would otherwise be an injection path into the child.
    NODE_OPTIONS: "",
  };
  for (const key of INHERITED_ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

function bounded(text) {
  const value = text || "";
  return value.length > MAX_CAPTURED_CHARS
    ? `${value.slice(0, MAX_CAPTURED_CHARS)}...[truncated]`
    : value;
}

/**
 * Runs one server-resolved project command. Every input here comes from a
 * `yusuf_project_commands` row plus a canonical repository root — never from
 * model output. Exposed as a promise that resolves with the exit code rather
 * than throwing on non-zero, so a failing test suite reads as evidence
 * ("validation failed") rather than as an adapter malfunction.
 */
function runProjectCommand({ executable, args, cwd, timeoutMs }) {
  assertAllowedExecutable(executable);
  if (!Array.isArray(args) || args.some((a) => typeof a !== "string"))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Command arguments must be an array of strings.",
      { status: 422 }
    );
  if (args.some((a) => a.includes("\0")))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "Command arguments may not contain a null byte.",
      { status: 422 }
    );
  if (!cwd || typeof cwd !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "A command requires an explicit working directory.",
      { status: 422 }
    );

  return new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      {
        cwd,
        shell: false,
        windowsHide: true,
        timeout: timeoutMs,
        killSignal: "SIGKILL",
        maxBuffer: MAX_BUFFER_BYTES,
        env: minimalEnv(),
      },
      (error, stdout, stderr) => {
        if (error && error.killed)
          return reject(
            Object.assign(
              new Error(`Project command timed out: ${executable}`),
              { effectCertain: false, timedOut: true }
            )
          );
        if (error && typeof error.code !== "number")
          return reject(
            Object.assign(
              new Error(
                `Project command could not be started: ${error.message}`
              ),
              { effectCertain: true, spawnFailure: true }
            )
          );
        resolve({
          exitCode: error ? error.code : 0,
          stdout: bounded(stdout ? stdout.toString("utf8") : ""),
          stderr: bounded(stderr ? stderr.toString("utf8") : ""),
        });
      }
    );
  });
}

module.exports = {
  INHERITED_ENV_ALLOWLIST,
  minimalEnv,
  runProjectCommand,
};
