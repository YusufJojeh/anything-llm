const {
  denyUnattendedToolApproval,
  assertNoUngovernedScheduledExtensions,
} = require("../../../jobs/helpers/scheduled-approval-policy");

describe("scheduled approval policy", () => {
  test("an unattended worker can never grant legacy or Yusuf authority", async () => {
    const log = jest.fn();
    await expect(denyUnattendedToolApproval(log)).resolves.toMatchObject({
      approved: false,
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("unattended workers cannot grant authority")
    );
  });
});

test.each([
  "@@custom-skill",
  "@@flow_uuid",
  "@@mcp_server",
  "sql-agent#sql-query",
  "gmail-agent#gmail-send-email",
  "filesystem-agent#filesystem-write-file",
  "unknown-tool",
])(
  "blocks unclassified or mutating scheduled tool %s before loading",
  (tool) => {
    expect(() => assertNoUngovernedScheduledExtensions([tool])).toThrow(
      "unavailable to unattended scheduled jobs"
    );
  }
);

test("allows only explicit code-owned read-only scheduled tools", () => {
  expect(
    assertNoUngovernedScheduledExtensions(["rag-memory", "document-summarizer"])
  ).toEqual(["rag-memory", "document-summarizer"]);
});
