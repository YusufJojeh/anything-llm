const {
  resolveForm,
  assertFieldsAllowed,
  assertPageMatchesForm,
  __setRegistryForTests,
} = require("../../../domain/yusufOS/adapters/browser/formRegistry");
const {
  accountIdentityDigest,
  assertAccountMatches,
  assertPageUnchanged,
  classifyFailure,
  certainFailure,
  uncertainFailure,
} = require("../../../domain/yusufOS/adapters/browser/mutationGuards");
const {
  ENV_ENABLED,
  ENV_ALLOWLIST,
} = require("../../../domain/yusufOS/adapters/browser/originPolicy");

/**
 * Pure-function edge cases for the two modules that keep `browser.submit_form`
 * a semantic capability rather than a generic clicker: the form registry
 * (what may be submitted, with what fields) and the mutation guards (whose
 * account, whose page).
 */

const ORIGIN = "https://example.test";
const FORM_KEY = "test.contact_form";

function seedRegistry() {
  __setRegistryForTests({
    [FORM_KEY]: {
      formKey: FORM_KEY,
      origin: ORIGIN,
      pathPattern: /^\/contact$/,
      submitSelector: "#submit",
      fields: {
        message: { selector: "#message", maxLength: 10, required: true },
        subject: { selector: "#subject", maxLength: 20, required: false },
      },
      verification: { kind: "URL_PATTERN", pattern: /\/thanks$/ },
      description: "Test-only contact form.",
    },
  });
}

function reasonOf(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error?.details?.reason || null;
  }
}

describe("formRegistry", () => {
  beforeEach(() => {
    seedRegistry();
    process.env[ENV_ENABLED] = "true";
    process.env[ENV_ALLOWLIST] = ORIGIN;
  });

  afterAll(() => {
    __setRegistryForTests(null);
    delete process.env[ENV_ENABLED];
    delete process.env[ENV_ALLOWLIST];
  });

  test("resolveForm refuses an unknown key rather than improvising", () => {
    expect(reasonOf(() => resolveForm("no.such.form"))).toBe("UNREGISTERED_FORM");
  });

  test("resolveForm refuses a form whose origin is not allowlisted", () => {
    process.env[ENV_ALLOWLIST] = "https://other.test";
    expect(reasonOf(() => resolveForm(FORM_KEY))).toBe("ORIGIN_NOT_ALLOWED");
  });

  test("assertFieldsAllowed rejects a field the descriptor never named", () => {
    const descriptor = resolveForm(FORM_KEY);
    expect(reasonOf(() => assertFieldsAllowed(descriptor, { message: "hi", injected: "x" }))).toBe(
      "FIELD_NOT_ALLOWED"
    );
  });

  test("assertFieldsAllowed rejects a missing required field", () => {
    const descriptor = resolveForm(FORM_KEY);
    expect(reasonOf(() => assertFieldsAllowed(descriptor, { subject: "hi" }))).toBe("FIELD_REQUIRED");
  });

  test("assertFieldsAllowed rejects a non-string value", () => {
    const descriptor = resolveForm(FORM_KEY);
    expect(reasonOf(() => assertFieldsAllowed(descriptor, { message: 12345 }))).toBe(
      "FIELD_NOT_STRING"
    );
  });

  test("assertFieldsAllowed rejects a value over the descriptor's maxLength", () => {
    const descriptor = resolveForm(FORM_KEY);
    expect(reasonOf(() => assertFieldsAllowed(descriptor, { message: "way too long" }))).toBe(
      "FIELD_TOO_LONG"
    );
  });

  test("assertFieldsAllowed silently omits an optional field that was never supplied", () => {
    const descriptor = resolveForm(FORM_KEY);
    const cleaned = assertFieldsAllowed(descriptor, { message: "hi" });
    expect(cleaned).toEqual({ message: "hi" });
  });

  test("assertPageMatchesForm rejects a different origin", () => {
    const descriptor = resolveForm(FORM_KEY);
    expect(reasonOf(() => assertPageMatchesForm(descriptor, "https://other.test/contact"))).toBe(
      "ORIGIN_MISMATCH"
    );
  });

  test("assertPageMatchesForm rejects a page on the right origin but the wrong path", () => {
    const descriptor = resolveForm(FORM_KEY);
    expect(reasonOf(() => assertPageMatchesForm(descriptor, `${ORIGIN}/other`))).toBe("PATH_MISMATCH");
  });

  test("assertPageMatchesForm rejects an unparseable URL", () => {
    const descriptor = resolveForm(FORM_KEY);
    expect(reasonOf(() => assertPageMatchesForm(descriptor, "not a url"))).toBe("UNPARSEABLE_URL");
  });

  test("assertPageMatchesForm accepts the exact origin and path", () => {
    const descriptor = resolveForm(FORM_KEY);
    expect(assertPageMatchesForm(descriptor, `${ORIGIN}/contact`)).toBe(true);
  });
});

describe("mutationGuards", () => {
  test("accountIdentityDigest returns null for an identity the page merely claims", () => {
    expect(
      accountIdentityDigest({ state: "authenticated", accountLabel: "yusuf", verifiedBySession: false })
    ).toBeNull();
  });

  test("accountIdentityDigest returns null for an unauthenticated identity", () => {
    expect(
      accountIdentityDigest({ state: "unauthenticated", accountLabel: "yusuf", verifiedBySession: true })
    ).toBeNull();
  });

  test("accountIdentityDigest is deterministic for the same origin and label", () => {
    const identity = { origin: ORIGIN, accountLabel: "yusuf", state: "authenticated", verifiedBySession: true };
    expect(accountIdentityDigest(identity)).toBe(accountIdentityDigest({ ...identity }));
  });

  test("accountIdentityDigest differs across accounts on the same origin", () => {
    const base = { origin: ORIGIN, state: "authenticated", verifiedBySession: true };
    expect(accountIdentityDigest({ ...base, accountLabel: "yusuf" })).not.toBe(
      accountIdentityDigest({ ...base, accountLabel: "someone-else" })
    );
  });

  test("assertAccountMatches refuses an unverified current identity even with a bound digest", () => {
    expect(
      reasonOf(() =>
        assertAccountMatches("some-bound-digest", {
          state: "authenticated",
          accountLabel: "yusuf",
          verifiedBySession: false,
        })
      )
    ).toBe("ACCOUNT_UNVERIFIED");
  });

  test("assertAccountMatches refuses when the approval never bound an account", () => {
    const identity = { origin: ORIGIN, accountLabel: "yusuf", state: "authenticated", verifiedBySession: true };
    expect(reasonOf(() => assertAccountMatches(null, identity))).toBe("ACCOUNT_NOT_BOUND");
  });

  test("assertAccountMatches refuses a genuine mismatch", () => {
    const bound = accountIdentityDigest({
      origin: ORIGIN,
      accountLabel: "yusuf",
      state: "authenticated",
      verifiedBySession: true,
    });
    expect(
      reasonOf(() =>
        assertAccountMatches(bound, {
          origin: ORIGIN,
          accountLabel: "someone-else",
          state: "authenticated",
          verifiedBySession: true,
        })
      )
    ).toBe("ACCOUNT_MISMATCH");
  });

  test("assertAccountMatches accepts a genuine match", () => {
    const identity = { origin: ORIGIN, accountLabel: "yusuf", state: "authenticated", verifiedBySession: true };
    const bound = accountIdentityDigest(identity);
    expect(assertAccountMatches(bound, identity)).toBe(true);
  });

  test("assertPageUnchanged refuses when the approval never bound a page state", () => {
    expect(reasonOf(() => assertPageUnchanged(null, "abc"))).toBe("PAGE_NOT_BOUND");
  });

  test("assertPageUnchanged refuses when the current page state is unreadable", () => {
    expect(reasonOf(() => assertPageUnchanged("abc", null))).toBe("PAGE_UNREADABLE");
  });

  test("assertPageUnchanged refuses a genuine drift", () => {
    expect(reasonOf(() => assertPageUnchanged("abc", "xyz"))).toBe("PAGE_CHANGED");
  });

  test("assertPageUnchanged accepts a match", () => {
    expect(assertPageUnchanged("abc", "abc")).toBe(true);
  });

  test("classifyFailure treats a certain, pre-effect error as a clean FAILED", () => {
    expect(classifyFailure({ effectCertain: true })).toMatchObject({
      effectCertain: true,
      outcome: "FAILED",
      reason: "REFUSED_BEFORE_EFFECT",
    });
  });

  test("classifyFailure treats an unmarked error as UNKNOWN, never a clean failure", () => {
    expect(classifyFailure({})).toMatchObject({ effectCertain: false, outcome: "UNKNOWN" });
    expect(classifyFailure(new Error("boom"))).toMatchObject({ effectCertain: false, outcome: "UNKNOWN" });
  });

  test("classifyFailure treats an explicitly uncertain error as UNKNOWN", () => {
    expect(classifyFailure({ effectCertain: false })).toMatchObject({
      effectCertain: false,
      outcome: "UNKNOWN",
    });
  });

  test("certainFailure marks the thrown error as effectCertain", () => {
    const error = certainFailure("nothing happened");
    expect(error.effectCertain).toBe(true);
  });

  test("uncertainFailure marks the thrown error as not effectCertain", () => {
    const error = uncertainFailure("outcome unknown");
    expect(error.effectCertain).toBe(false);
    expect(error.code).toBe("EXECUTION_UNKNOWN");
  });
});
