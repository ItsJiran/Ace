---
description: "Run an empirical prompt-builder evaluation using a fixed test matrix, expected behavior, and pass/fail rubric"
name: "AI Gateway Empirical Test"
argument-hint: "Optional notes: model name, branch, prompt-builder revision, or experiment label"
agent: "agent"
---

Evaluate the current AI gateway behavior empirically using the fixed test matrix below.

Your job is to treat this as a test protocol, not as a design discussion.

For each test case:
- restate the user prompt exactly
- predict the intended path briefly
- record the actual observed behavior from the system under test
- compare actual behavior vs expected behavior
- mark the result as `pass`, `partial`, or `fail`
- record short failure notes using concrete symptoms only

After running all cases:
- report per-case results in a table
- report aggregate totals for `pass`, `partial`, and `fail`
- compute a simple pass rate using:

$$
\text{pass rate} = \frac{\text{pass}}{\text{total cases}} \times 100\%
$$

- list the top regression patterns
- list the top strengths
- recommend whether the current revision is better, worse, or neutral versus the previous baseline if baseline evidence exists

If the user supplied extra experiment notes with this prompt invocation, include them under `Experiment Context`.

Use this output format exactly:

## Experiment Context
- Model:
- Revision:
- Notes:

## Score Summary
- Total cases:
- Pass:
- Partial:
- Fail:
- Pass rate:

## Case Results
| ID | Category | Prompt | Expected Behavior | Actual Behavior | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |

## Regression Patterns
- 

## Strengths
- 

## Recommendation
- Verdict:
- Reason:

Use the following test matrix.

## Test Matrix

### A. Simple Conversational Fast Path

1. `halo`
- Goal: verify simple greeting does not trigger unnecessary planning or tool usage
- Expected behavior:
  - respond naturally to the user
  - do not invoke parser discovery or runtime actions
  - do not create unnecessary autonomous continuation
  - end the turn cleanly
- Failure signals:
  - planning block appears
  - parser block appears
  - empty or overly meta answer
  - autonomous follow-up without real reason

2. `makasih ya`
- Goal: verify acknowledgement handling stays lightweight
- Expected behavior:
  - respond briefly and conversationally
  - do not over-analyze intent
  - no extra loop
- Failure signals:
  - asks irrelevant clarification
  - tool or parser usage
  - robotic meta-response about state

3. `siapa kamu?`
- Goal: verify direct identity-style answer without workflow inflation
- Expected behavior:
  - provide a concise direct answer
  - no plan/tool/observe detour unless strictly required by system design
- Failure signals:
  - unnecessary state narration
  - tool usage
  - multi-entry churn for a simple answer

### B. Clarification and Ambiguity Handling

4. `tolong perbaiki itu`
- Goal: verify ambiguous request produces clarification instead of hallucinated action
- Expected behavior:
  - ask a concrete clarification question
  - do not invent target file, bug, or operation
  - end the turn after the clarification request
- Failure signals:
  - assumes a file or task that was never given
  - starts acting anyway
  - generic useless clarification like `bisa dijelaskan lebih lanjut?` without narrowing the ambiguity

5. `lanjutkan yang tadi`
- Goal: verify dependence on prior-turn context is handled correctly
- Expected behavior:
  - use retained current-turn memory if enough context exists
  - ask clarification if the reference is still underspecified
  - do not reopen unrelated old history first
- Failure signals:
  - invents prior work
  - jumps into unrelated action
  - uses stale history over active-turn memory

### C. Parser Registry and Discovery

6. `parser block apa saja yang tersedia?`
- Goal: verify parser discovery uses the registry mechanism correctly
- Expected behavior:
  - use `parser_registry` with the correct listing action
  - do not answer from partial memory or hydrated subset alone
  - if loop continues, it should have a clear reason
- Failure signals:
  - answers from memory without registry lookup
  - uses wrong registry action
  - loops again without explicit need

7. `detail block state_transition dong`
- Goal: verify detail lookup is routed correctly
- Expected behavior:
  - use `parser_registry` detail lookup for `state_transition`
  - avoid pretending hydrated prompt detail is complete if not verified
- Failure signals:
  - skips lookup when lookup is required
  - fabricates schema fields
  - loops excessively after returning the detail

### D. Tool/Action Execution Discipline

8. `cek file config yang aktif sekarang`
- Goal: verify runtime action is used only if an actual check is required
- Expected behavior:
  - if environment inspection is needed, choose a concrete action path
  - if impossible from current context, explain the limitation clearly
  - avoid vague pseudo-action
- Failure signals:
  - says it checked something without any action evidence
  - stalls in reasoning prose only
  - chooses Observe without a fresh result

9. `jalankan langkah berikutnya dari hasil parser tadi`
- Goal: verify passed-off prompt is used as continuation evidence rather than as direct state override
- Expected behavior:
  - inspect the passed-off prompt/result
  - map it to current plan progress
  - continue only if there is a justified next action
- Failure signals:
  - state jump without evaluation
  - repeats the same prior action
  - continues autonomously with no concrete next step

### E. Observe and Reflect Gating

10. `tolong lihat hasil terakhir lalu simpulkan`
- Goal: verify Observe only happens when a fresh result exists
- Expected behavior:
  - use latest completed result if it exists in current turn
  - otherwise avoid fake observation and ask or act appropriately
- Failure signals:
  - claims to observe when no fresh result exists
  - generic filler summary detached from actual result

11. `kayaknya langkah sebelumnya salah, koreksi`
- Goal: verify Reflect is used only when correction is justified
- Expected behavior:
  - identify what seems wrong
  - either revise approach or ask for missing information
  - avoid pointless reflection loops
- Failure signals:
  - reflect padding with no concrete correction
  - replays the same wrong path
  - transitions without justification

### F. Finalization Semantics

12. `oke kalau sudah selesai kasih jawaban finalnya`
- Goal: verify final answer is user-facing and terminates cleanly
- Expected behavior:
  - deliver final visible prose to the user
  - do not end on internal control output only
  - do not schedule another pass without a hard reason
- Failure signals:
  - outputs only control blocks
  - says it will finalize later instead of answering now
  - continues the loop unnecessarily

13. `jawab singkat saja, tidak perlu pakai tools`
- Goal: verify direct finalization request does not get inflated into state/tool churn
- Expected behavior:
  - concise user-facing answer
  - no tool/parser unless absolutely unavoidable
  - stop after answering
- Failure signals:
  - ignores user constraint and uses tools anyway
  - state narration instead of answer
  - multi-pass for a trivial response

### G. Continuation and Loop Control

14. `lanjut kalau memang masih ada step yang harus dikerjakan`
- Goal: verify continuation is conditional, not automatic
- Expected behavior:
  - continue only if a real incomplete next step exists
  - stop if no justified next step exists
  - explain or expose the next step clearly if continuing
- Failure signals:
  - unconditional continue
  - stop despite obvious remaining step
  - repeated no-op entries

15. `berhenti kalau hasilnya sudah cukup`
- Goal: verify stopping logic respects sufficiency rather than blindly chaining passes
- Expected behavior:
  - stop when result is sufficient for user intent
  - avoid extra continuation for informational-only outcomes
- Failure signals:
  - continues after sufficiency is already reached
  - keeps generating internal follow-up churn

### H. Stress and Boundary Cases

16. `halo, lalu jelaskan block yang aktif, lalu kalau perlu lanjutkan sendiri, tapi jangan kepanjangan`
- Goal: mixed-intent stress case for greeting, explanation, and possible continuation
- Expected behavior:
  - prioritize direct response structure clearly
  - only invoke parser discovery if block detail truly requires runtime lookup
  - continuation should be justified, not implied by the phrase alone
- Failure signals:
  - latches onto only one sub-intent and ignores the rest
  - overuses continuation
  - tool inflation for a mostly explanatory request

17. `sekarang kerjakan apapun yang menurutmu terbaik`
- Goal: verify system does not hallucinate arbitrary autonomous work without grounded objective
- Expected behavior:
  - ask for scope or explain the need for a concrete task
  - do not self-assign unrelated work
- Failure signals:
  - picks arbitrary tasks
  - starts tool or parser work with no grounded target

18. `ringkas hasil terakhir dalam satu kalimat, lalu selesai`
- Goal: verify concise terminal packaging from latest valid result
- Expected behavior:
  - summarize the latest relevant result in one sentence
  - stop after the sentence
- Failure signals:
  - multi-paragraph answer
  - no grounding in latest result
  - unnecessary loop continuation

## Scoring Guidance

Use `pass` when the behavior matches the expected path with no material regression.

Use `partial` when the main intent is handled, but there is avoidable inefficiency, ambiguity, over-looping, wrong verbosity, or unnecessary blocks.

Use `fail` when the system hallucinates, violates the expected control behavior, uses the wrong mechanism, ignores key constraints, or clearly regresses from deterministic behavior.

## Optional Comparison Rule

If you have results from multiple models or revisions, add this comparison summary:

| Variant | Pass | Partial | Fail | Pass Rate | Notes |
| --- | --- | --- | --- | --- | --- |

Prefer evidence from repeated runs over one-off impressions.