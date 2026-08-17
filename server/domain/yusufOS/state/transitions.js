const {
  TASK_STATUSES,
  RUN_STATUSES,
  INTENT_STATUSES,
  APPROVAL_STATUSES,
} = require("../constants");
const { YusufOSError, ErrorCodes } = require("../errors/YusufOSError");

const transitions = Object.freeze({
  task: {
    [TASK_STATUSES.PLANNED]: [TASK_STATUSES.READY, TASK_STATUSES.CANCELLED],
    [TASK_STATUSES.READY]: [TASK_STATUSES.RUNNING, TASK_STATUSES.CANCELLED],
    [TASK_STATUSES.RUNNING]: [
      TASK_STATUSES.BLOCKED,
      TASK_STATUSES.WAITING_APPROVAL,
      TASK_STATUSES.COMPLETED,
      TASK_STATUSES.FAILED,
      TASK_STATUSES.CANCELLED,
    ],
    [TASK_STATUSES.BLOCKED]: [TASK_STATUSES.READY, TASK_STATUSES.CANCELLED],
    [TASK_STATUSES.WAITING_APPROVAL]: [
      TASK_STATUSES.RUNNING,
      TASK_STATUSES.FAILED,
      TASK_STATUSES.CANCELLED,
    ],
  },
  run: {
    [RUN_STATUSES.QUEUED]: [RUN_STATUSES.RUNNING, RUN_STATUSES.CANCELLED],
    [RUN_STATUSES.RUNNING]: [
      RUN_STATUSES.WAITING_TOOL,
      RUN_STATUSES.WAITING_APPROVAL,
      RUN_STATUSES.WAITING_HANDOFF,
      RUN_STATUSES.WAITING_DEPENDENCY,
      RUN_STATUSES.BLOCKED,
      RUN_STATUSES.VERIFYING,
      RUN_STATUSES.COMPLETED,
      RUN_STATUSES.FAILED,
      RUN_STATUSES.FAILED_UNKNOWN,
      RUN_STATUSES.CANCELLED,
    ],
    [RUN_STATUSES.WAITING_TOOL]: [
      RUN_STATUSES.RUNNING,
      RUN_STATUSES.WAITING_APPROVAL,
      RUN_STATUSES.FAILED,
      RUN_STATUSES.FAILED_UNKNOWN,
      RUN_STATUSES.CANCELLED,
    ],
    [RUN_STATUSES.WAITING_APPROVAL]: [
      RUN_STATUSES.RUNNING,
      RUN_STATUSES.BLOCKED,
      RUN_STATUSES.FAILED,
      RUN_STATUSES.CANCELLED,
    ],
    // A run that handed work to another Agent is finished with its own turn;
    // it completes or is cancelled. It never silently resumes RUNNING, because
    // the receiving Agent owns the next step.
    [RUN_STATUSES.WAITING_HANDOFF]: [
      RUN_STATUSES.COMPLETED,
      RUN_STATUSES.BLOCKED,
      RUN_STATUSES.FAILED,
      RUN_STATUSES.CANCELLED,
    ],
    [RUN_STATUSES.WAITING_DEPENDENCY]: [
      RUN_STATUSES.QUEUED,
      RUN_STATUSES.CANCELLED,
    ],
    [RUN_STATUSES.BLOCKED]: [RUN_STATUSES.QUEUED, RUN_STATUSES.CANCELLED],
    [RUN_STATUSES.VERIFYING]: [
      RUN_STATUSES.COMPLETED,
      RUN_STATUSES.FAILED,
      RUN_STATUSES.FAILED_UNKNOWN,
    ],
    [RUN_STATUSES.FAILED_UNKNOWN]: [
      RUN_STATUSES.VERIFYING,
      RUN_STATUSES.COMPLETED,
      RUN_STATUSES.FAILED,
    ],
  },
  intent: {
    [INTENT_STATUSES.INTENT_CREATED]: [INTENT_STATUSES.POLICY_EVALUATED],
    [INTENT_STATUSES.POLICY_EVALUATED]: [
      INTENT_STATUSES.POLICY_DENIED,
      INTENT_STATUSES.FORBIDDEN,
      INTENT_STATUSES.WAITING_APPROVAL,
      INTENT_STATUSES.AUTHORIZED,
    ],
    [INTENT_STATUSES.WAITING_APPROVAL]: [
      INTENT_STATUSES.AUTHORIZED,
      INTENT_STATUSES.INVALIDATED,
      INTENT_STATUSES.CANCELLED,
    ],
    [INTENT_STATUSES.AUTHORIZED]: [
      INTENT_STATUSES.EXECUTING,
      INTENT_STATUSES.INVALIDATED,
      INTENT_STATUSES.CANCELLED,
    ],
    [INTENT_STATUSES.EXECUTING]: [
      INTENT_STATUSES.EXECUTED_UNVERIFIED,
      INTENT_STATUSES.FAILED,
      INTENT_STATUSES.FAILED_UNKNOWN,
    ],
    [INTENT_STATUSES.EXECUTED_UNVERIFIED]: [
      INTENT_STATUSES.VERIFIED,
      INTENT_STATUSES.FAILED,
      INTENT_STATUSES.FAILED_UNKNOWN,
    ],
    [INTENT_STATUSES.FAILED_UNKNOWN]: [
      INTENT_STATUSES.VERIFIED,
      INTENT_STATUSES.FAILED,
    ],
  },
  approval: {
    [APPROVAL_STATUSES.PENDING]: [
      APPROVAL_STATUSES.APPROVED,
      APPROVAL_STATUSES.REJECTED,
      APPROVAL_STATUSES.EXPIRED,
      APPROVAL_STATUSES.INVALIDATED,
    ],
    [APPROVAL_STATUSES.APPROVED]: [
      APPROVAL_STATUSES.CONSUMED,
      APPROVAL_STATUSES.EXPIRED,
      APPROVAL_STATUSES.INVALIDATED,
    ],
  },
});

function canTransition(machine, from, to) {
  return transitions[machine]?.[from]?.includes(to) === true;
}

function assertTransition(machine, from, to) {
  if (canTransition(machine, from, to)) return true;
  throw new YusufOSError(
    ErrorCodes.INVALID_STATE_TRANSITION,
    `Illegal ${machine} transition from ${from} to ${to}.`,
    { status: 422, details: { machine, from, to } }
  );
}

async function conditionalTransition({
  delegate,
  id,
  version,
  from,
  to,
  machine,
  data = {},
}) {
  assertTransition(machine, from, to);
  const result = await delegate.updateMany({
    where: { id: Number(id), status: from, version: Number(version) },
    data: { ...data, status: to, version: { increment: 1 } },
  });
  if (result.count !== 1)
    throw new YusufOSError(
      ErrorCodes.INVALID_STATE_TRANSITION,
      `The ${machine} state changed before the transition could be applied.`,
      {
        status: 409,
        details: { id, expectedStatus: from, expectedVersion: version },
      }
    );
  return true;
}

module.exports = {
  transitions,
  canTransition,
  assertTransition,
  conditionalTransition,
};
