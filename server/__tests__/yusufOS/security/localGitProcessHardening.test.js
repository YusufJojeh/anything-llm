const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  runGit,
  minimalEnv,
  hardenedConfigArgs,
  INHERITED_ENV_ALLOWLIST,
} = require("../../../domain/yusufOS/adapters/localGit/gitProcess");

function fixtureEnv(home) {
  return {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1",
    HOME: home,
    USERPROFILE: home,
    GIT_TERMINAL_PROMPT: "0",
  };
}
function git(args, cwd, home) {
  return execFileSync("git", args, { cwd, env: fixtureEnv(home), encoding: "utf8" });
}

describe("gitProcess environment and config hardening", () => {
  const SENSITIVE_ENV_KEYS = [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "AWS_SECRET_ACCESS_KEY",
    "YUSUF_OS_AUDIT_HMAC_KEY",
    "YUSUF_OS_CONTROL_TOKEN",
    "DATABASE_URL",
  ];

  test("the child environment allowlist contains nothing secret-shaped", () => {
    for (const key of INHERITED_ENV_ALLOWLIST) {
      expect(key).not.toMatch(/key|token|secret|password|credential/i);
    }
  });

  test("secret-shaped environment variables present in the parent process are not forwarded to the Git child environment", () => {
    const restore = {};
    for (const key of SENSITIVE_ENV_KEYS) {
      restore[key] = process.env[key];
      process.env[key] = `test-value-for-${key}`;
    }
    try {
      const env = minimalEnv();
      for (const key of SENSITIVE_ENV_KEYS) {
        expect(env).not.toHaveProperty(key);
      }
    } finally {
      for (const key of SENSITIVE_ENV_KEYS) {
        if (restore[key] === undefined) delete process.env[key];
        else process.env[key] = restore[key];
      }
    }
  });

  test("the child environment isolates HOME/USERPROFILE from Yusuf's real profile", () => {
    const env = minimalEnv();
    expect(env.HOME).not.toBe(process.env.HOME);
    expect(env.GIT_CONFIG_NOSYSTEM).toBe("1");
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
  });

  test("hardened config args disable credential helper, external diff, fsmonitor, and pager, and enable local push", () => {
    const args = hardenedConfigArgs().join(" ");
    expect(args).toContain("credential.helper=");
    expect(args).toContain("diff.external=");
    expect(args).toContain("core.fsmonitor=false");
    expect(args).toContain("core.pager=cat");
    expect(args).toContain("protocol.file.allow=always");
  });

  test("a configured external diff program does not run for a governed diff read", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "yusuf-os-ext-diff-"));
    const markerFile = path.join(root, "EXTDIFF_RAN");
    try {
      git(["init", "--initial-branch=main", "."], root, root);
      git(["config", "user.name", "t"], root, root);
      git(["config", "user.email", "t@example.invalid"], root, root);
      fs.writeFileSync(path.join(root, "a.txt"), "one\n");
      git(["add", "a.txt"], root, root);
      git(["commit", "-m", "init"], root, root);

      // A hostile local repo config pointing diff.external at a script that
      // would prove it ran. The hardened `-c diff.external=` override must
      // win over this repo-local config for the life of the invocation.
      const evilScript = path.join(root, "evil-diff.sh");
      fs.writeFileSync(
        evilScript,
        `#!/bin/sh\ntouch "${markerFile.replace(/\\/g, "/")}"\n`,
        { mode: 0o755 }
      );
      git(["config", "diff.external", evilScript], root, root);
      fs.writeFileSync(path.join(root, "a.txt"), "two\n");

      const result = await runGit({ args: ["diff", "--no-ext-diff", "--no-textconv", "HEAD"], cwd: root });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(markerFile)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("a configured textconv filter does not run for a governed diff read", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "yusuf-os-textconv-"));
    const markerFile = path.join(root, "TEXTCONV_RAN");
    try {
      git(["init", "--initial-branch=main", "."], root, root);
      git(["config", "user.name", "t"], root, root);
      git(["config", "user.email", "t@example.invalid"], root, root);
      fs.writeFileSync(path.join(root, ".gitattributes"), "*.bin diff=marker\n");
      fs.writeFileSync(path.join(root, "a.bin"), "one\n");
      git(["add", "."], root, root);
      git(["commit", "-m", "init"], root, root);

      const evilScript = path.join(root, "evil-textconv.sh");
      fs.writeFileSync(
        evilScript,
        `#!/bin/sh\ntouch "${markerFile.replace(/\\/g, "/")}"\ncat "$1"\n`,
        { mode: 0o755 }
      );
      git(["config", "diff.marker.textconv", evilScript], root, root);
      fs.writeFileSync(path.join(root, "a.bin"), "two\n");

      const result = await runGit({ args: ["diff", "--no-ext-diff", "--no-textconv", "HEAD"], cwd: root });
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(markerFile)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
