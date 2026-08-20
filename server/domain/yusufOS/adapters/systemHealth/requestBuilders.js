const RESOURCE_TYPE = "SYSTEM_HEALTH";

async function buildReadHealthRequest() {
  return {
    resource: { type: RESOURCE_TYPE, id: "current", version: "N/A" },
    target: {},
    payload: {},
    environment: "LOCAL",
  };
}

module.exports = { RESOURCE_TYPE, buildReadHealthRequest };
