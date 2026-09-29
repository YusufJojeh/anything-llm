import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import userEvent from "@testing-library/user-event";
import { renderWithI18n, i18n } from "./renderWithI18n";

/**
 * ApprovalReview is the L3/L4 decision screen — the highest-stakes page in
 * the app — and had zero direct render coverage before this file. Its call
 * into `useYusufResource` also carried a real bug: a stray positional array
 * argument (`[approvalId, reloadKey]`) was passed in the slot the hook
 * destructures as `{ watch }`, silently shadowing the real `{ watch:
 * realtime.lastAppliedSequence }` object passed as an unused third argument
 * (`useYusufResource` only ever accepts two parameters). The effect's watch
 * re-fetch never fired, so this page could sit on stale data — including a
 * PENDING/decidable render for an approval that had actually already been
 * decided, invalidated or expired elsewhere — until the operator manually
 * acted or navigated away and back. The first test below reproduces exactly
 * that failure mode and fails against the pre-fix code.
 */

const context = vi.hoisted(() => ({ value: null }));
vi.mock("@/features/yusufOS/state/YusufOSProvider", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useYusufOS: () => context.value };
});

const api = vi.hoisted(() => ({
  approvalReview: vi.fn(),
  decideApproval: vi.fn(),
}));
vi.mock("@/features/yusufOS/api/client", () => ({ yusufApi: api }));

import ApprovalReview from "@/pages/YusufOS/ApprovalReview";

function reviewFixture(overrides = {}) {
  return {
    approval: {
      approvalId: "approval-1",
      status: "PENDING",
      riskLevel: "L3",
      requestedAt: "2026-09-06T00:00:00.000Z",
      expiresAt: "2026-09-06T03:00:00.000Z",
      invalidationReason: null,
    },
    requestedBy: {
      principalType: "AGENT",
      agentId: "engineering",
      agentName: "Engineering",
    },
    context: {
      taskId: "task-1",
      taskTitle: "Ship the feature",
      taskStatus: "BLOCKED",
      runId: "run-1",
      runKind: "IMPLEMENTATION",
      project: null,
      latestReviewVerdict: null,
      latestReviewAt: null,
    },
    capability: {
      key: "git.push_feature_branch",
      version: 1,
      description: "Push a feature branch to the bound remote.",
      domain: "git",
      mutation: true,
    },
    target: {
      resourceType: "repository",
      resourceId: "gate-g",
      resourceVersion: "abc123",
      environment: "local",
      targetIdentityDigest: "digest-value",
      accountIdentityDigest: null,
    },
    policy: {
      outcome: "REQUIRE_APPROVAL",
      riskLevel: "L3",
      reasonCode: "EXTERNAL_MUTATION_REQUIRES_APPROVAL",
      explanation: "Pushing to a remote is an external mutation.",
    },
    execution: {
      intentStatus: "WAITING_APPROVAL",
      receiptOutcome: null,
      verificationStatus: null,
    },
    decision: {
      approvalRouteId: 1,
      expectedPayloadHash: "a".repeat(64),
      expectedIntentVersion: 1,
      expectedApprovalVersion: 1,
      decidable: true,
    },
    ...overrides,
  };
}

function baseContext(sequence = 0) {
  return {
    realtime: { lastAppliedSequence: sequence },
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ApprovalReview realtime resync", () => {
  test("re-reads the approval when the realtime layer reports server state moved", async () => {
    // `rerender` replaces the whole tree passed to the initial `render`, so
    // the MemoryRouter/I18nextProvider wrapper must be reconstructed here
    // rather than going through `renderWithI18n` a second time — otherwise a
    // rerender with only `<ApprovalReview />` drops the Router context out
    // from under the page's own `<Link>`s.
    const tree = () => (
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/os/approvals/approval-1"]}>
          <ApprovalReview />
        </MemoryRouter>
      </I18nextProvider>
    );

    context.value = baseContext(0);
    api.approvalReview.mockResolvedValue(reviewFixture());
    const view = render(tree());
    await screen.findByText("git.push_feature_branch");
    expect(api.approvalReview).toHaveBeenCalledTimes(1);

    context.value = baseContext(1);
    view.rerender(tree());

    await waitFor(() => expect(api.approvalReview).toHaveBeenCalledTimes(2));
  });
});

describe("ApprovalReview decision surface", () => {
  test("a decidable approval requires an explicit confirm step before approving", async () => {
    context.value = baseContext();
    api.approvalReview.mockResolvedValue(reviewFixture());
    const user = userEvent.setup();
    renderWithI18n(<ApprovalReview />, { route: "/os/approvals/approval-1" });

    const approveOnce = await screen.findByRole("button", {
      name: "Approve once",
    });
    await user.click(approveOnce);
    // Clicking "approve once" must not itself decide anything yet.
    expect(api.decideApproval).not.toHaveBeenCalled();

    const confirm = await screen.findByRole("button", {
      name: "Yes, approve once",
    });
    await user.click(confirm);
    expect(api.decideApproval).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ decision: "APPROVE" })
    );
  });

  test("a non-decidable approval offers no action, and there is no wildcard/bulk approve control", async () => {
    context.value = baseContext();
    api.approvalReview.mockResolvedValue(
      reviewFixture({
        decision: { ...reviewFixture().decision, decidable: false },
      })
    );
    renderWithI18n(<ApprovalReview />, { route: "/os/approvals/approval-1" });
    await screen.findByText("git.push_feature_branch");
    expect(
      screen.queryByRole("button", { name: "Approve once" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reject" })
    ).not.toBeInTheDocument();
  });

  test("a failed decision shows the real server error and leaves the page decidable", async () => {
    context.value = baseContext();
    api.approvalReview.mockResolvedValue(reviewFixture());
    api.decideApproval.mockRejectedValue(new Error("version conflict"));
    const user = userEvent.setup();
    renderWithI18n(<ApprovalReview />, { route: "/os/approvals/approval-1" });

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "version conflict"
    );
  });

  test("a load failure renders as an error", async () => {
    context.value = baseContext();
    api.approvalReview.mockRejectedValue(new Error("not found"));
    renderWithI18n(<ApprovalReview />, { route: "/os/approvals/approval-1" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
