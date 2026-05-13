# DeepAgent Integration Roadmap

## Goal

Ship a usable agent runtime faster by replacing the current custom cognitive orchestration with a DeepAgent harness, while keeping the existing ACE frontend as a thin client for input, streaming output, renderer mounting, and observability.

This roadmap assumes:
- speed of delivery is more important than maximum runtime customizability
- agent behavior customization will primarily live in Markdown files
- frontend-owned planning, context, memory, and custom ReAct lifecycle should be frozen or removed
- only UI-oriented parsing should remain on the client

## Current Situation

The repo currently has three overlapping layers:
- a TypeScript frontend session runtime with parser blocks, session inspector, and streamed text ingestion
- a Python gateway sidecar with a partially migrated custom graph runtime still in progress
- a custom cognitive mirror on the frontend for planning, context, memory, and phase state

This causes double ownership:
- the backend is trying to own the agent runtime
- the frontend still carries legacy parser-era cognitive contracts

The main delivery risk is not model access. The main risk is maintaining two agent architectures at once.

## Target Architecture

### Backend
- DeepAgent harness becomes the primary agent runtime
- Markdown files define:
  - system behavior
  - tool policy
  - response contract
  - memory policy
  - domain instructions
- backend owns:
  - ReAct loop
  - tool execution policy
  - planning
  - memory
  - context assembly
  - retries
  - stop conditions

### Frontend
- frontend becomes a thin client
- frontend keeps:
  - chat input
  - session creation and selection
  - streamed text rendering
  - tool/result display
  - debug inspector
  - optional UI render blocks
- frontend stops owning:
  - planning logic
  - working memory logic
  - context synthesis
  - parser-driven state transitions
  - prompt building

### Transport
- prefer structured event envelopes from backend over cognitive text parsing
- keep plain text streaming for the user-visible response
- allow optional side-channel metadata for:
  - current node or step
  - current memory summary
  - current plan summary
  - tool lifecycle

## Migration Principle

Do not migrate everything at once.

Use this order:
1. adopt DeepAgent harness as the backend runtime
2. freeze frontend cognitive parsing
3. keep frontend renderer parsing only where it has direct UI value
4. replace ad hoc text protocol with structured metadata incrementally
5. remove dead compatibility surfaces after the harness path is stable

## Scope Decisions

### Keep
- `src/services/aiGateway/*` session lifecycle shell
- `src/core/packages/system-dev/components/AISessionInspector.tsx`
- frontend stream reader and response rendering
- minimal parser support for presentational or renderer blocks if still needed
- provider configuration and model selection UI
- Python sidecar HTTP contract shape where possible

### Freeze
- frontend planning mutation logic
- frontend context mutation logic
- frontend working memory mutation logic
- frontend state transition ownership
- prompt-builder-style orchestration on the client

### Remove Later
- compatibility parser blocks that exist only for old cognitive flow
- old custom ReAct block protocol if DeepAgent metadata supersedes it
- duplicated graph snapshot mirror code that no longer adds user-facing value

## Phase 0: Decision Lock

### Objective
Commit to DeepAgent harness as the default runtime path.

### Deliverables
- one architecture decision record in Markdown
- one chosen customization folder for DeepAgent prompt and policy files
- one explicit list of frontend cognitive features that are deprecated

### Acceptance Criteria
- no new investment in frontend-owned planning or custom ReAct control flow
- all new agent runtime work happens behind the Python gateway

## Phase 1: Minimal DeepAgent Backend

### Objective
Get one DeepAgent-backed request working through the existing gateway.

### Work
- add a DeepAgent runtime adapter in `src-gateway-server/core/`
- keep `/chat/{sdk}` as the entry point if possible
- load base instructions from Markdown files
- run a minimal ReAct loop with model plus tools
- stream final response text back to ACE frontend

### Suggested Files
- `src-gateway-server/core/deepagent_runtime.py`
- `src-gateway-server/prompts/agent/system.md`
- `src-gateway-server/prompts/agent/tool_policy.md`
- `src-gateway-server/prompts/agent/output_contract.md`

### Acceptance Criteria
- one prompt can go through DeepAgent and stream back successfully
- no custom frontend planning logic is required for a usable answer

## Phase 2: Markdown-Driven Customization

### Objective
Move agent customization into Markdown files rather than custom code.

### Markdown Files
- `system.md`: high-level agent behavior and role
- `tool_policy.md`: when tools are allowed, required, or forbidden
- `memory_policy.md`: what facts should be retained
- `style.md`: tone, formatting, and answer shape
- `domain/*.md`: feature-specific instructions

### Rules
- Markdown files define policy, not transport protocol
- backend combines Markdown sources into the harness prompt stack
- frontend should not need to know how these files are composed

### Acceptance Criteria
- changing Markdown content changes agent behavior without frontend changes
- at least one behavior change is validated only by editing Markdown

## Phase 3: Memory and Context via Harness

### Objective
Replace the current pseudo-memory approach with backend-owned harness memory.

### Work
- use harness memory or session state as the source of truth
- keep short-term conversation history in backend session scope
- retain durable facts such as:
  - user name
  - preferences
  - task constraints
  - active work context
- expose summarized memory and context to the frontend inspector for debugging only

### Acceptance Criteria
- the agent can recall a simple fact such as `nama saya X` in a later turn
- frontend inspector shows backend-provided memory summaries
- frontend does not synthesize memory on its own

## Phase 4: Tooling and ReAct Surface

### Objective
Let DeepAgent own ReAct while ACE only visualizes important execution signals.

### Work
- map current useful tools into the harness tool contract
- expose tool lifecycle metadata through structured events
- keep frontend renderer support for tool results if useful
- remove dependence on parser blocks for cognitive transitions

### Preserve Only What Matters
- user-visible tool results
- progress/debug traces
- optional UI render directives

### Acceptance Criteria
- one tool-enabled flow runs end-to-end through DeepAgent
- tool status can be inspected in the frontend without custom cognitive block parsing

## Phase 5: Frontend Thin-Client Cleanup

### Objective
Delete or freeze frontend code that is only needed for the legacy custom ReAct design.

### Candidate Freeze/Delete List
- parser blocks for planning, context, working memory, parser registry, summarize prompt
- frontend state transition ownership
- any remaining prompt-builder logic
- any client-owned autonomous follow-up loop logic that duplicates harness behavior

### Keep for Now
- stream parsing for user-visible text
- renderer block handling if still needed
- session inspector panels for debugging

### Acceptance Criteria
- no frontend component is responsible for deciding the next agent step
- the agent still works if cognitive parser blocks never appear

## Phase 6: Structured Event Transport

### Objective
Replace fragile cognitive text parsing with explicit metadata events.

### Event Types
- `agent_snapshot`
- `tool_started`
- `tool_completed`
- `memory_updated`
- `plan_updated`
- `final_response`

### Transport Options
- keep plain text stream plus side-channel event frames
- or move to SSE / NDJSON while preserving a simple frontend adapter

### Acceptance Criteria
- planner and memory updates are delivered as structured metadata
- frontend no longer depends on parsing cognitive instructions from model text

## Phase 7: Hardening

### Objective
Make the DeepAgent path the default and de-risk removal of legacy flow.

### Work
- add focused test coverage for DeepAgent gateway execution
- add fallback behavior when harness fails
- add instruction file validation
- add startup diagnostics for missing Markdown policy files
- document how to add a new policy Markdown file safely

### Acceptance Criteria
- default runtime path uses DeepAgent
- legacy custom cognitive path is either disabled or clearly marked experimental

## Recommended Immediate File Map

### New Backend Files
- `src-gateway-server/core/deepagent_runtime.py`
- `src-gateway-server/prompts/agent/system.md`
- `src-gateway-server/prompts/agent/tool_policy.md`
- `src-gateway-server/prompts/agent/memory_policy.md`
- `src-gateway-server/prompts/agent/output_contract.md`

### Existing Files to Adapt
- `src-gateway-server/core/gateway.py`
- `src-gateway-server/core/deepagent_runtime.py`
- `src-gateway-server/routes/api.py`
- `src/services/aiGateway/sub-services/interactionParserLoop/requestOrchestration.ts`
- `src/services/aiGateway/sub-services/interactionParserLoop/streamProcessor.ts`
- `src/core/packages/system-dev/components/AISessionInspector.tsx`

### Existing Files to Freeze or Deprecate
- frontend cognitive parser block files under `src/core/packages/system/parsers/`
- any remaining client-owned prompt composition surfaces

## Risks

### Risk 1: Two runtimes at once
If DeepAgent is added without freezing legacy cognitive parsing, complexity gets worse, not better.

Mitigation:
- declare one default runtime path
- stop evolving the legacy path immediately

### Risk 2: Markdown turns into hidden code
If too much logic is pushed into prompt Markdown, behavior becomes hard to reason about.

Mitigation:
- keep Markdown for policy and behavior
- keep deterministic transport and orchestration in code

### Risk 3: Lost observability
If the harness is adopted without metadata transport, debugging will get harder.

Mitigation:
- preserve the inspector
- emit structured agent snapshots and tool events

### Risk 4: Incomplete tool migration
If DeepAgent tool integration is partial, user experience may regress.

Mitigation:
- migrate only the smallest useful tool subset first
- validate one complete tool flow before expanding

## Success Criteria

The integration is successful when:
- a user can chat through the DeepAgent-backed gateway end-to-end
- agent behavior is customizable through Markdown files
- the agent can recall simple facts across turns
- frontend no longer owns cognitive orchestration
- inspector still shows enough backend state to debug failures
- legacy custom parsing is no longer on the critical path

## First Implementation Sprint

### Sprint Goal
Get a DeepAgent-backed minimal runtime working without breaking the current UI.

### Sprint Tasks
1. Add `deepagent_runtime.py` with a minimal harness adapter.
2. Load one `system.md` file and one `tool_policy.md` file.
3. Route `/chat/{sdk}` to the DeepAgent runtime behind a feature flag.
4. Keep streaming plain text output compatible with the current frontend.
5. Emit one simple structured metadata snapshot for inspector visibility.
6. Freeze frontend cognitive parser evolution.

### Sprint Exit Criteria
- one provider works through DeepAgent
- one session can complete multi-turn recall
- no new frontend cognitive parsing is required

## Recommendation

If the priority is to ship faster, use DeepAgent harness as the runtime and treat Markdown files as the primary customization layer.

Do not try to preserve the full legacy custom cognitive protocol during this migration.

Keep the ACE frontend thin, observable, and UI-focused.
