# Debug Session: conversation-send-cancelled
- **Status**: [OPEN]
- **Issue**: Sending a follow-up conversation message fails while the UI shows `Assistant run cancelled` and `Conversation run cancelled`.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: `.dbg/trae-debug-log-conversation-send-cancelled.ndjson`

## Reproduction Steps
1. Open the affected conversation.
2. Enter a follow-up message.
3. Send the message.
4. Observe the failure toast and cancelled run state.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Startup reconciliation incorrectly cancels a resumable conversation run. | High | Low | Rejected for the new send: persisted session is terminal with revision 4 and accepts a new-turn attempt. |
| B | The send IPC fails before the new user message and run are committed. | High | Low | Confirmed: log lines 1-3 show Renderer submissions, while no Main-handler event or database write follows. |
| C | A model or tool abort is normalized into cancellation and propagated to the conversation. | Medium | Medium | Rejected: model resolution and Gateway are never reached. |
| D | The terminal state of the previous turn incorrectly blocks a new follow-up message. | Medium | Low | Rejected: failure occurs before Main loads the authoritative session. |

## Log Evidence
Instrumentation points:
- Renderer submission: expected revision, selected model, turn/message counts.
- Main command admission: expected versus persisted revision and previous terminal state.
- Send use-case entry: authoritative session revision and pending assistant count.
- Model resolution boundary: selected profile and successful execution-config resolution.
- Turn creation result: conflict/active/started outcome and resulting revision.
- Gateway lifecycle: created run and observed terminal/suspension state.

Pre-fix log cleared before reproduction.

Pre-fix evidence:
- Lines 1-3: three Renderer submissions used session revision 4 and the enabled DeepSeek profile.
- No Main command-admission event was emitted for any submission.
- SQLite remained at one turn and revision 4 after all three attempts.
- The Renderer always sends `contextMode: "auto"`.
- `AppendConversationMessageCommand` declares `contextMode`, but
  `requireAppendConversationMessageCommand` omits it from both the allowed
  field list and parsed result.

## Verification Conclusion
Confirmed root cause: the IPC runtime validator rejects the valid
`contextMode` field before the append handler executes.

Minimal fix:
- Added `contextMode` to the append command allowed-field list.
- Parsed it with the existing strict conversation context-mode validator.
- Focused IPC tests: 165 passed.

Post-fix log cleared; awaiting one real send for comparison.
