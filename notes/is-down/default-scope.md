# Default scopes

**Decision:** a catalog entry can set `defaultScope`, exact component or group names that a check without a selector covers. Cloudflare's is `["Cloudflare Sites and Services"]`, so `is-down` and `is-down cloudflare` check its products, and data centers are checked with a selector such as `cloudflare:sydney`.

Implemented in `evaluatePage` in [`src/status/evaluate.ts`](../../src/status/evaluate.ts), which treats the default scope like a selector, and documented in [`docs/cli.md`](../../docs/cli.md#what-counts-as-degraded) and [`docs/providers.md`](../../docs/providers.md#schema). Locked by "unscoped checks cover only the provider default scope" in [`tests/specs/get-status.ts`](../../tests/specs/get-status.ts). `pnpm test:live` checks that the names exist on the live page.

## Problem

Before this change, the default `is-down` run reported Cloudflare as degraded on every run, even with no open incident. Cloudflare lists about 340 data centers as components, and dozens are in partial outage, degraded, or under maintenance at any time ([cloudflare/status-page.md](../cloudflare/status-page.md)). An unscoped check is degraded when any component is not operational or the page indicator is not `none`, and both were true in 100% of 374 captures from 2022 to 2026. So the default run exited `1` and lost its meaning.

## Why a scope and not `ignoreComponents`

- An unscoped check also counts the page indicator, which Cloudflare derives from the data centers. Ignoring the data-center components would leave the indicator rule failing. A scope already turns that rule off, because the indicator covers the whole page.
- A scope already filters incidents to the ones linked to it, gives a description of the scope instead of the page's "Partial System Outage", and keeps data centers reachable with a selector.
- `ignoreComponents` means "placeholders that carry no status". Data centers carry real status.

`result.scope` stays the caller's `components` option, so the CLI label and JSON output do not change for unscoped checks.

## Accepted trade-off

Incidents linked only to data centers, such as "Network Performance Issues in Ashburn, IAD", no longer count in the default check. They were 3 of 47 impactful incidents over 64 days. Incidents linked to no component still count.

## Cloudflare still looks degraded often

With the default scope, Cloudflare had an impactful incident open 24.2% of the last 14 days, against 9.3% for GitHub and less than 7% for the other default services (`pnpm audit-status`, 2026-10-31). These are real, mostly `minor` and regional product incidents, so they are reported. Whether `minor` incidents should count toward the exit code is a separate question for every provider, not part of this decision.

## Rejected: a scheduled sampling job

The first plan was a GitHub Actions cron job that sampled the default services every 15 minutes for a week and committed the samples to a branch. It was rejected:

- The data already exists. The Wayback Machine has hundreds of `summary.json` captures since 2022, and `incidents.json` gives each incident's start and resolution times.
- GitHub documents that scheduled runs "can be delayed during periods of high loads" and that "some queued jobs may be dropped", and disables them in public repositories after 60 days without activity ([`schedule` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)).
- It needed `contents: write`, a storage branch, and an end date, for a week of data.

`pnpm audit-status` recomputes the numbers on demand instead.

## When to revisit

- If Cloudflare renames "Cloudflare Sites and Services", unscoped Cloudflare checks fail with "No component matches", and `pnpm test:live` fails.
- If another provider's default run is red most of the time, measure it with `pnpm audit-status <id> --history` and consider a `defaultScope` for it.
