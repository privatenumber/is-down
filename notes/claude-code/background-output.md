# Claude Code: output from long-running commands

Claude Code can deliver a running command's output to the model in two ways: once when a background command exits, or one notification per stdout line with the `Monitor` tool. Sources: the [tools reference](https://code.claude.com/docs/en/tools-reference), accessed 2026-10-31.

## Bash tool

- Foreground commands time out after 2 minutes by default (`BASH_DEFAULT_TIMEOUT_MS`), capped at 10 minutes (`BASH_MAX_TIMEOUT_MS`). A command that reaches its timeout is moved to the background, unless it starts with `sleep`.
- `run_in_background: true` starts a background task. Claude is notified when it finishes, and can read the task's output file before that.
- Background commands have a time limit only in unattended sessions (`-p`, Agent SDK, CI, cloud): 30 minutes by default, 2 hours at most. Interactive local sessions have no limit.

## Monitor tool

"Runs a command in the background and feeds each output line back to Claude." From the tools reference:

- "Every watch Claude starts has a deadline: 5 minutes by default, at most 30 minutes, and at most 10 minutes in a non-interactive run." At the deadline, Claude gets one notice and can start the watch again.
- Only stdout is streamed.

The tool's model-facing description adds guidance for scripts it runs ([community copy](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-background-monitor-streaming-events.md) of the prompt, not an official source):

- "Your script's stdout is the event stream. Each line becomes a notification. Exit ends the watch."
- "Stdout lines within 200ms are batched into a single notification."
- "Coverage — silence is not success": a watch should print failure and terminal states, not only success.
- Monitors that produce too many events are stopped automatically.

## Known issues

- [anthropics/claude-code#76508](https://github.com/anthropics/claude-code/issues/76508): Monitor notifications intermittently held 30-90 s after the line was printed. Closed as not planned.
- [anthropics/claude-code#89357](https://github.com/anthropics/claude-code/issues/89357): background or auto sessions can busy-wait, re-reading a background task's output file instead of idling until the notification. Open as of 2026-10-31.
