const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  resolveWithinRoot,
  assertStagingPathsAllowed,
} = require("../../../domain/yusufOS/adapters/localGit/pathPolicy");
const {
  assertValidBranchName,
  assertValidRevision,
  isProtectedBranch,
} = require("../../../domain/yusufOS/adapters/localGit/branchPolicy");
const {
  assertNoEmbeddedCredentials,
  canonicalRemoteFingerprint,
} = require("../../../domain/yusufOS/adapters/localGit/remoteIdentity");

describe("LocalGit path escape and injection defenses", () => {
  let root;
  beforeAll(() => {
    root = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "yusuf-os-path-policy-"))
    );
    fs.mkdirSync(path.join(root, "src"));
    fs.writeFileSync(path.join(root, "src", "app.js"), "// ok\n");
    fs.writeFileSync(path.join(root, ".env"), "SECRET=1\n");
  });
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  test("an allowed path inside the root resolves cleanly", () => {
    expect(resolveWithinRoot(root, "src/app.js").relativePath).toBe("src/app.js");
  });

  test("traversal outside the root is denied", () => {
    expect(() => resolveWithinRoot(root, "../../etc/passwd")).toThrow();
  });

  test("an absolute path is denied", () => {
    expect(() => resolveWithinRoot(root, path.join(root, "src", "app.js"))).toThrow();
  });

  test("a path beginning with '-' is denied as option injection", () => {
    expect(() => resolveWithinRoot(root, "--upload-pack=evil")).toThrow();
  });

  test(".env is denied as a protected path", () => {
    expect(() => resolveWithinRoot(root, ".env")).toThrow();
  });

  test(".git internals are denied", () => {
    expect(() => resolveWithinRoot(root, ".git/config")).toThrow();
    expect(() => resolveWithinRoot(root, "src/.git/hooks/pre-commit")).toThrow();
  });

  test.each([
    ["id_rsa"],
    ["id_ed25519.pub"],
    ["service.pem"],
    ["client.key"],
    [".env.production"],
    ["credentials.json"],
  ])("protected basename %s is denied even inside an allowed directory", (name) => {
    expect(() => resolveWithinRoot(root, `src/${name}`)).toThrow();
  });

  test("a directory pathspec is denied, including '.' for the whole tree", () => {
    // Regression: Git recursively expands a directory pathspec, which would
    // silently stage every file underneath — including a nested .env — even
    // though none of those filenames were themselves checked.
    expect(() => resolveWithinRoot(root, ".")).toThrow();
    expect(() => resolveWithinRoot(root, "src")).toThrow();
  });

  test.each([[".env."], [".env "], ["id_rsa."], ["id_rsa "]])(
    "a Windows trailing dot/space variant of a protected name (%s) is still denied",
    (name) => {
      // Regression: Win32 strips trailing dots/spaces from the final path
      // component, so ".env." and ".env" name the same on-disk file — the
      // check must not be foolable by spelling the protected name this way.
      expect(() => resolveWithinRoot(root, `src/${name}`)).toThrow();
    }
  );

  test("symlink escape is denied", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "yusuf-os-outside-"));
    const outsideFile = path.join(outsideDir, "secret.txt");
    fs.writeFileSync(outsideFile, "outside\n");
    const linkPath = path.join(root, "escape-link");
    try {
      fs.symlinkSync(outsideDir, linkPath, "junction");
    } catch {
      // Symlink privilege may be unavailable in this environment; skip
      // rather than fail — the traversal and absolute-path tests above
      // already cover the lexical half of this defense.
      fs.rmSync(outsideDir, { recursive: true, force: true });
      return;
    }
    expect(() => resolveWithinRoot(root, "escape-link/secret.txt")).toThrow();
    fs.rmSync(linkPath, { force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  test("assertStagingPathsAllowed rejects an empty selection instead of defaulting to 'everything'", () => {
    expect(() => assertStagingPathsAllowed(root, [])).toThrow();
    expect(() => assertStagingPathsAllowed(root, undefined)).toThrow();
  });

  test("assertStagingPathsAllowed accepts a valid batch and normalizes slashes", () => {
    expect(assertStagingPathsAllowed(root, ["src/app.js"])).toEqual(["src/app.js"]);
  });
});

describe("LocalGit branch and revision validation", () => {
  test("a normal feature branch name is accepted", () => {
    expect(assertValidBranchName("feature/gate-d-slice")).toBe("feature/gate-d-slice");
  });

  test.each([
    ["-evil"],
    [""],
    ["a..b"],
    ["a//b"],
    ["a@{b}"],
    ["a\\b"],
    ["a~1"],
    ["a^"],
    ["a:b"],
    ["a?b"],
    ["a*b"],
    ["a["],
    ["a.lock"],
    [".hidden"],
    ["a/.hidden"],
  ])("rejects invalid branch name %s", (name) => {
    expect(() => assertValidBranchName(name)).toThrow();
  });

  test("main and master are protected by default even with no project configuration", () => {
    expect(isProtectedBranch("main", [])).toBe(true);
    expect(isProtectedBranch("master", [])).toBe(true);
    expect(isProtectedBranch("feature/x", [])).toBe(false);
  });

  test("project configuration can add further protected branches", () => {
    expect(isProtectedBranch("release", ["release"])).toBe(true);
  });

  test("a single revision is accepted, including HEAD~1 syntax", () => {
    expect(assertValidRevision("HEAD")).toBe("HEAD");
    expect(assertValidRevision("HEAD~1")).toBe("HEAD~1");
    expect(assertValidRevision("a1b2c3d")).toBe("a1b2c3d");
  });

  test.each([["-x"], ["a..b"], ["a...b"], ["a@{1}"]])(
    "rejects revision range/reflog/option syntax: %s",
    (ref) => {
      expect(() => assertValidRevision(ref)).toThrow();
    }
  );
});

describe("LocalGit remote identity handling", () => {
  test("a URL with an embedded password is rejected outright", () => {
    expect(() =>
      assertNoEmbeddedCredentials("https://user:hunter2@github.com/example/repo.git")
    ).toThrow();
  });

  test("a bare user@host (no password) is not treated as an embedded credential", () => {
    expect(() => assertNoEmbeddedCredentials("git@github.com:example/repo.git")).not.toThrow();
  });

  test("two different local remote paths fingerprint differently", () => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), "yusuf-os-remote-a-"));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), "yusuf-os-remote-b-"));
    expect(canonicalRemoteFingerprint(a)).not.toBe(canonicalRemoteFingerprint(b));
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  });

  test("fingerprinting a credentialed https URL throws rather than silently stripping it", () => {
    expect(() =>
      canonicalRemoteFingerprint("https://user:hunter2@github.com/example/repo.git")
    ).toThrow();
  });
});
