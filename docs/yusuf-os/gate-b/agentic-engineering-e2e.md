# Agentic Engineering E2E

Phase V proves that the Agent runtime, rather than a test helper, chooses the engineering work.

The fixture uses a disposable local repository containing a deterministic calculator defect. A
scripted routed model supplies strict decisions to the production `AgentReasoningLoop`:

1. Chief hands the objective to Engineering.
2. Engineering creates and switches to a feature branch, reads the source, writes the minimal fix,
   invokes the registered validation command, stages the changed file, and creates a local commit.
3. The runtime projects implementation and validation evidence only from governed receipts.
4. Engineering hands off to Reviewer. Reviewer receives bounded, redacted evidence, receipt, and
   policy context, then independently reads the committed change and returns a routed verdict.
5. `CompletionPolicy` reads persisted evidence, receipts, and review state to complete the task.

The fixture never uses a network, credential, hosted repository, manual capability orchestration,
or a model-provided authority field. An optional real Ollama Chief-loop smoke runs only when a
compatible local model is available.
