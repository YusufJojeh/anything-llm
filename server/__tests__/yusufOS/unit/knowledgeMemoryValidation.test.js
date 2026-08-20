const knowledgeBuilders = require("../../../domain/yusufOS/adapters/knowledge/requestBuilders");
const memoryBuilders = require("../../../domain/yusufOS/adapters/memory/requestBuilders");
const { assertScopeOwnership } = require("../../../domain/yusufOS/adapters/memory/scopeIdentity");
const {
  EVIDENCE_CLASSES,
  EVIDENCE_RETENTION_DAYS,
  MEMORY_SCOPES,
  PRINCIPAL_TYPES,
} = require("../../../domain/yusufOS/constants");

function reasonOf(promise) {
  return promise.then(
    () => null,
    (error) => error?.details?.reason || error?.code || null
  );
}

describe("Phase J — Knowledge request builder validation", () => {
  test("rejects a missing title", async () => {
    await expect(
      knowledgeBuilders.buildWriteRequest({ body: "b", sourceType: "AGENT_DERIVED" })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("rejects an unknown sourceType", async () => {
    await expect(
      knowledgeBuilders.buildWriteRequest({ title: "t", body: "b", sourceType: "MADE_UP" })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("rejects an oversized body", async () => {
    await expect(
      knowledgeBuilders.buildWriteRequest({
        title: "t",
        body: "x".repeat(9000),
        sourceType: "AGENT_DERIVED",
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("rejects too many tags", async () => {
    await expect(
      knowledgeBuilders.buildWriteRequest({
        title: "t",
        body: "b",
        sourceType: "AGENT_DERIVED",
        tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("mints a fresh server-owned uuid on every valid call", async () => {
    const a = await knowledgeBuilders.buildWriteRequest({
      title: "t",
      body: "b",
      sourceType: "USER_PROVIDED",
    });
    const b = await knowledgeBuilders.buildWriteRequest({
      title: "t",
      body: "b",
      sourceType: "USER_PROVIDED",
    });
    expect(a.target.uuid).not.toBe(b.target.uuid);
    expect(a.resource.version).toBe("ABSENT");
  });

  test("read requires either uuid or tag", async () => {
    await expect(knowledgeBuilders.buildReadRequest({})).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("Phase J — Memory request builder validation", () => {
  const fakeDb = {
    yusuf_memory_entries: { findUnique: async () => null },
  };

  test("rejects an unknown scope", async () => {
    await expect(
      memoryBuilders.buildWriteRequest(
        { scope: "GLOBAL", scopeRef: "x", key: "k", value: "v" },
        fakeDb
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("rejects a missing scopeRef", async () => {
    await expect(
      memoryBuilders.buildWriteRequest(
        { scope: MEMORY_SCOPES.PROJECT, key: "k", value: "v" },
        fakeDb
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("rejects a missing value", async () => {
    await expect(
      memoryBuilders.buildWriteRequest(
        { scope: MEMORY_SCOPES.PROJECT, scopeRef: "p", key: "k" },
        fakeDb
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("rejects an oversized value", async () => {
    await expect(
      memoryBuilders.buildWriteRequest(
        { scope: MEMORY_SCOPES.PROJECT, scopeRef: "p", key: "k", value: "x".repeat(20000) },
        fakeDb
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  test("resource.version reflects the current digest when a row already exists", async () => {
    const db = {
      yusuf_memory_entries: { findUnique: async () => ({ digest: "abc123" }) },
    };
    const request = await memoryBuilders.buildWriteRequest(
      { scope: MEMORY_SCOPES.PROJECT, scopeRef: "p", key: "k", value: "v" },
      db
    );
    expect(request.resource.version).toBe("abc123");
  });
});

describe("Phase J — Memory scope ownership", () => {
  function intentOf(overrides) {
    return { agentId: 1, taskId: 1, requestedByPrincipalType: PRINCIPAL_TYPES.AGENT, ...overrides };
  }

  test("PERSONAL scope is refused for any Agent principal", async () => {
    const reason = await reasonOf(
      assertScopeOwnership({ scope: MEMORY_SCOPES.PERSONAL, scopeRef: "x" }, intentOf({}), {})
    );
    expect(reason).toBe("SCOPE_FORBIDDEN_FOR_AGENT");
  });

  test("PERSONAL scope is allowed for a USER principal", async () => {
    await expect(
      assertScopeOwnership(
        { scope: MEMORY_SCOPES.PERSONAL, scopeRef: "x" },
        intentOf({ requestedByPrincipalType: PRINCIPAL_TYPES.USER }),
        {}
      )
    ).resolves.toBeUndefined();
  });

  test("AGENT scope requires scopeRef to equal the acting agent's uuid", async () => {
    const db = { yusuf_agents: { findUnique: async () => ({ uuid: "agent-uuid-1" }) } };
    await expect(
      assertScopeOwnership({ scope: MEMORY_SCOPES.AGENT, scopeRef: "agent-uuid-1" }, intentOf({}), db)
    ).resolves.toBeUndefined();
    const reason = await reasonOf(
      assertScopeOwnership({ scope: MEMORY_SCOPES.AGENT, scopeRef: "someone-else" }, intentOf({}), db)
    );
    expect(reason).toBe("SCOPE_NOT_OWNED");
  });

  test("TASK scope requires scopeRef to equal the bound task's uuid", async () => {
    const db = { yusuf_tasks: { findUnique: async () => ({ uuid: "task-uuid-1" }) } };
    await expect(
      assertScopeOwnership({ scope: MEMORY_SCOPES.TASK, scopeRef: "task-uuid-1" }, intentOf({}), db)
    ).resolves.toBeUndefined();
    const reason = await reasonOf(
      assertScopeOwnership({ scope: MEMORY_SCOPES.TASK, scopeRef: "wrong" }, intentOf({}), db)
    );
    expect(reason).toBe("SCOPE_NOT_OWNED");
  });

  test("PROJECT scope resolves through the task's projectId", async () => {
    const db = {
      yusuf_tasks: { findUnique: async () => ({ projectId: 7 }) },
      yusuf_projects: { findUnique: async () => ({ uuid: "project-uuid-7" }) },
    };
    await expect(
      assertScopeOwnership(
        { scope: MEMORY_SCOPES.PROJECT, scopeRef: "project-uuid-7" },
        intentOf({}),
        db
      )
    ).resolves.toBeUndefined();
    const reason = await reasonOf(
      assertScopeOwnership({ scope: MEMORY_SCOPES.PROJECT, scopeRef: "wrong" }, intentOf({}), db)
    );
    expect(reason).toBe("SCOPE_NOT_OWNED");
  });

  test("PROJECT scope is refused for a task with no project", async () => {
    const db = { yusuf_tasks: { findUnique: async () => ({ projectId: null }) } };
    await expect(
      assertScopeOwnership({ scope: MEMORY_SCOPES.PROJECT, scopeRef: "x" }, intentOf({}), db)
    ).rejects.toMatchObject({ code: "ACTION_FORBIDDEN" });
  });
});

describe("Phase J — Evidence classification constants", () => {
  test("retention shortens as sensitivity rises", () => {
    expect(EVIDENCE_RETENTION_DAYS[EVIDENCE_CLASSES.PUBLIC_METADATA]).toBeGreaterThan(
      EVIDENCE_RETENTION_DAYS[EVIDENCE_CLASSES.SANITIZED_OUTPUT]
    );
    expect(EVIDENCE_RETENTION_DAYS[EVIDENCE_CLASSES.SANITIZED_OUTPUT]).toBeGreaterThan(
      EVIDENCE_RETENTION_DAYS[EVIDENCE_CLASSES.SENSITIVE_OPERATIONAL]
    );
    expect(EVIDENCE_RETENTION_DAYS[EVIDENCE_CLASSES.SENSITIVE_OPERATIONAL]).toBeGreaterThan(
      EVIDENCE_RETENTION_DAYS[EVIDENCE_CLASSES.SCREENSHOT]
    );
  });

  test("SECRET_FORBIDDEN has no retention entry — it is never persisted, never expired", () => {
    expect(EVIDENCE_RETENTION_DAYS[EVIDENCE_CLASSES.SECRET_FORBIDDEN]).toBeUndefined();
  });
});
