# The `watch` command

**Decision:** `is-down watch <incident-url>` is a subcommand that follows one incident. By default it prints one line per update and exits `0` when the incident resolves. `--until-update` exits `1` after the next check that finds updates, for agent harnesses that only report a command when it exits. There is no rerun cursor. The Node.js API is `watchIncident()`, an async iterator.

User-facing behavior is documented in [`docs/cli.md`](../../docs/cli.md#watch) and [`docs/node.md`](../../docs/node.md#watchincidenturl-options), and locked by [`tests/specs/cli/watch.ts`](../../tests/specs/cli/watch.ts) and [`tests/specs/watch-incident.ts`](../../tests/specs/watch-incident.ts).

## Subcommand, not a `--watch` flag

- Watching has its own exit codes (`0` resolved, `1` new update, `124` time limit, `2` not found). The main command's `1` means "degraded".
- Its flags (`--until-update`, `--max-wait`) mean nothing to a one-time check, and cleye's `strictFlags` cannot express "valid only with `--watch`".
- It takes one incident, not a list of services and selectors, and the main command's `--since` and `--json` have no meaning for it.

Prior art: [`gh run watch <id>`](https://cli.github.com/manual/gh_run_watch) is a subcommand with `--interval` and `--exit-status`. [`gh pr checks --watch`](https://cli.github.com/manual/gh_pr_checks) is a flag, and needs `--interval` and `--fail-fast` that only apply with it.

## One incident, not a whole service

An incident moves through `investigating`, `identified`, `monitoring`, and `resolved` (or `postmortem`), so "exit when resolved" has one meaning, and each update is one output line. A service-wide watch would have to define what happens when a second incident starts or a component recovers while an incident stays open.

## How agents receive the output

Harnesses deliver a running command's output in two ways:

- **Each output line as it arrives:** Claude Code's `Monitor` tool ([claude-code/background-output.md](../claude-code/background-output.md)), and Codex polling a running process ([codex/background-output.md](../codex/background-output.md)).
- **Only when the command exits:** OpenCode's background shell ([opencode/background-output.md](../opencode/background-output.md)), and Claude Code's background Bash notification.

A stream that ends at resolution gives exit-only harnesses nothing until the incident resolves. So:

- **Default mode** prints exactly one line per event, including failed checks, so a line-per-event harness receives each event whole. Update bodies are collapsed onto one line.
- **`--until-update`** exits after the check that finds updates, prints every update from that check, and ends with the exact command to run again. The [skill](../../skills/is-down/SKILL.md) tells agents to start the next run in the background before acting on the update.
- **`--max-wait`** keeps a run inside a harness time limit, such as Monitor's 30 minutes. It exits `124`, as GNU `timeout` does.

Prior art for the two modes: [`runpane watch`](https://github.com/greenfield-inc/Pane/blob/main/packages/runpane/README.md) has `--follow` (one line per event) and `--until-event` (exit on the next event, re-armed with a cursor). [`watch -g`](https://man7.org/linux/man-pages/man1/watch.1.html) exits when the output changes.

## No rerun cursor

Consul's [blocking queries](https://developer.hashicorp.com/consul/api-docs/features/blocking) and runpane pass a cursor so a client never misses an event between two requests. `watch` has none:

- Each run first prints the incident's latest update, so if one update is posted between two runs, it still shows.
- Incident updates are minutes apart, while the gap between runs is one tool call when the agent starts the next run before acting.
- A cursor would add a flag, timestamp parsing, and tie-breaking for one rare case.

**Known limit:** if several updates are posted between two runs, only the newest shows, and a rerun can print an update the previous run already printed. **Revisit** if agents act twice on a repeated update, or miss updates in practice; the cursor would be an `--after <created_at>` flag.

## Failures

A failed request (network error, timeout, HTTP 5xx) prints a line and the watch continues, even on the first check: status pages are often under load during the outages people watch. Only `not-found` and `unsupported` errors before the first successful check exit `2`. The API exposes this as `kind` on `error` events.

## Polling

- `watchIncident` is composed of `poll()` ([`src/utils/poll.ts`](../../src/utils/poll.ts)), `fetchIncidentById`, `describeFailure`, and `sortUpdates`, so the generator is one loop with one piece of state.
- The interval is 60 s. Statuspage caches `summary.json` for 10 s ([statuspage/public-api.md](../statuspage/public-api.md#caching)), so the interval is about load on the status page, not freshness.
- `poll()` waits a full interval after each check ends. `setInterval` from `node:timers/promises` was considered: it measures start to start, catches up with an immediate tick after a slow check, and needs the same abort-reason workaround. `poll()` is simpler to reason about.
- Each check combines the caller's `signal` with its own timeout via `AbortSignal.any`. A caller abort rejects with the signal's reason; a check timeout is an `error` event.

## Rerun command quoting

The rerun hint quotes arguments with POSIX single quotes when they contain characters outside `[\w./:=@%+-]` (`shellQuote` in [`src/cli/commands/watch.ts`](../../src/cli/commands/watch.ts)). [`shell-quote`](https://www.npmjs.com/package/shell-quote) 1.12.0 was rejected: its `quote()` also escapes `=`, printing `--max-wait\=10m`, and the hint is text that people and agents copy. [`shescape`](https://www.npmjs.com/package/shescape) targets escaping for child processes and is 167 KB unpacked. Neither quotes for Windows `cmd` or PowerShell.
