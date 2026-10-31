# Codex: output from long-running commands

With unified exec, Codex returns a still-running command to the model with a session ID, and the model polls it for new output. Audited at [rust-v0.166.0](https://github.com/openai/codex/tree/rust-v0.166.0).

## Polling

The `write_stdin` tool schema in [`codex-rs/core/src/tools/handlers/shell_spec.rs`](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/core/src/tools/handlers/shell_spec.rs#L121-L127) says:

- `chars`: "Bytes to write to stdin. Defaults to empty, which polls without writing."
- `yield_time_ms`: "Wait before yielding output. Non-empty writes default to 250 ms and cap at 30000 ms; empty polls wait 5000-300000 ms by default."

Each poll returns output produced since the previous one, so a streamed command's lines can be read while it runs, at the model's polling cadence.

[openai/codex#22541](https://github.com/openai/codex/issues/22541) reports that the initial `exec_command` yield is capped near 30 s even when a longer `yield_time_ms` is requested, while later `write_stdin` polls respect longer waits. Open as of 2026-10-31.

## Exit while idle

[openai/codex#33712](https://github.com/openai/codex/issues/33712) reported that when a backgrounded process exits while the session is idle, no turn starts, so the model never sees the result. It was closed as completed on 2026-07-17 without a comment or linked fix, so whether current releases wake the session is unverified.
