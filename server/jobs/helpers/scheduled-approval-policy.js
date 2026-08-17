async function denyUnattendedToolApproval(log = () => null) {
  log(
    "Scheduled tool approval denied: unattended workers cannot grant authority"
  );
  return {
    approved: false,
    message:
      "Unattended scheduled workers cannot approve tool mutations. Yusuf-governed actions require durable approval.",
  };
}

const SAFE_UNATTENDED_SCHEDULED_TOOLS = new Set([
  "rag-memory",
  "document-summarizer",
]);

function assertNoUngovernedScheduledExtensions(tools) {
  if (!Array.isArray(tools))
    throw new Error("Scheduled tool selection must be an explicit array.");
  const blocked = tools.filter(
    (tool) =>
      typeof tool !== "string" || !SAFE_UNATTENDED_SCHEDULED_TOOLS.has(tool)
  );
  if (blocked.length)
    throw new Error(
      `Unclassified or mutating tools are unavailable to unattended scheduled jobs: ${blocked.join(", ")}`
    );
  return tools;
}

module.exports = {
  denyUnattendedToolApproval,
  assertNoUngovernedScheduledExtensions,
  SAFE_UNATTENDED_SCHEDULED_TOOLS,
};
