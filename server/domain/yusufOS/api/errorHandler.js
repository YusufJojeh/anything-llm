const { YusufOSError } = require("../errors/YusufOSError");
const { sendError } = require("./controlPlaneGuard");

function handleYusufError(error, response) {
  if (error instanceof YusufOSError)
    return sendError(
      response,
      error.status,
      error.code,
      error.message,
      error.details
    );
  if (error?.code === "P2002")
    return sendError(
      response,
      409,
      "CONFLICT",
      "A Yusuf OS resource with this identity already exists."
    );
  console.error("Yusuf OS request failed:", error.message);
  return sendError(
    response,
    500,
    "INTERNAL_ERROR",
    "The Yusuf OS request could not be completed."
  );
}

module.exports = { handleYusufError };
