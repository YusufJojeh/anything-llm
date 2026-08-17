const fs = require("fs");
const prisma = require("../../../../utils/prisma");
const { YusufOSError, ErrorCodes } = require("../../errors/YusufOSError");
const { sha256 } = require("../../security/canonicalJson");
const { resolveBoundRepository } = require("../localGit/repositoryIdentity");
const { resolveWithinRoot } = require("../localGit/pathPolicy");
const { assertSemanticKey } = require("./commandRegistry");
const { MAX_FILE_BYTES } = require("./ProjectAdapter");

const RESOURCE_TYPE = "PROJECT_FILE";
const COMMAND_RESOURCE_TYPE = "PROJECT_COMMAND";

function currentDigest(absolutePath) {
  return fs.existsSync(absolutePath)
    ? sha256(fs.readFileSync(absolutePath))
    : "ABSENT";
}

async function buildReadFileRequest(args = {}, db = prisma) {
  const repository = await resolveBoundRepository(args.repositoryId, db);
  const { absolutePath, relativePath } = resolveWithinRoot(
    repository.canonicalRoot,
    args.relativePath,
    "relativePath"
  );
  return {
    resource: {
      type: RESOURCE_TYPE,
      id: `${repository.uuid}:${relativePath}`,
      version: currentDigest(absolutePath),
    },
    target: { repositoryId: repository.uuid, relativePath },
    payload: {},
    environment: "LOCAL",
  };
}

async function buildWriteFileRequest(args = {}, db = prisma) {
  const repository = await resolveBoundRepository(args.repositoryId, db);
  if (!repository.allowLocalCommit)
    throw new YusufOSError(
      ErrorCodes.ACTION_FORBIDDEN,
      "This project binding does not permit local writes.",
      { status: 403 }
    );
  const { absolutePath, relativePath } = resolveWithinRoot(
    repository.canonicalRoot,
    args.relativePath,
    "relativePath"
  );
  if (typeof args.contents !== "string")
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "contents must be a string.",
      { status: 422 }
    );
  if (Buffer.byteLength(args.contents, "utf8") > MAX_FILE_BYTES)
    throw new YusufOSError(
      ErrorCodes.VALIDATION_ERROR,
      "contents exceeds the governed write size limit.",
      { status: 422 }
    );
  return {
    resource: {
      type: RESOURCE_TYPE,
      id: `${repository.uuid}:${relativePath}`,
      version: currentDigest(absolutePath),
    },
    target: { repositoryId: repository.uuid, relativePath },
    payload: { contents: args.contents },
    environment: "LOCAL",
  };
}

async function buildRunCommandRequest(args = {}, db = prisma) {
  const repository = await resolveBoundRepository(args.repositoryId, db);
  const commandKey = assertSemanticKey(args.commandKey);
  return {
    resource: {
      type: COMMAND_RESOURCE_TYPE,
      id: `${repository.uuid}:${commandKey}`,
      // A command run is not bound to file state — re-running validation after
      // a legitimate edit must not be treated as a stale-resource violation.
      version: "N/A",
    },
    target: { repositoryId: repository.uuid, commandKey },
    payload: { commandKey },
    environment: "LOCAL",
  };
}

module.exports = {
  RESOURCE_TYPE,
  COMMAND_RESOURCE_TYPE,
  buildReadFileRequest,
  buildWriteFileRequest,
  buildRunCommandRequest,
};
