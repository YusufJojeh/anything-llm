const { randomUUID } = require("crypto");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { MONITORING_CHECK_KEYS } = require("../../constants");

const RESOURCE_TYPE = "MONITORING_CHECK";

async function buildRecordCheckRequest(args = {}) {
  if (!Object.values(MONITORING_CHECK_KEYS).includes(args.checkKey))
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      `Unknown checkKey: ${args.checkKey}`,
      { status: 422 }
    );
  // The server, not the model, mints identity and later derives the verdict —
  // this call carries no status/observedValue at all. See
  // docs/yusuf-os/gate-b/monitoring.md.
  const uuid = randomUUID();
  return {
    resource: { type: RESOURCE_TYPE, id: uuid, version: "ABSENT" },
    target: { uuid, checkKey: args.checkKey },
    payload: {},
    environment: "LOCAL",
  };
}

module.exports = { RESOURCE_TYPE, buildRecordCheckRequest };
