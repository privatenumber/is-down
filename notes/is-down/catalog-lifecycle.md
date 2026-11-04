# Catalog lifecycle

**Decision:** a catalog entry whose service shut down, or that has no public status page, gets a `deprecated` reason in a minor release. Deprecated entries are removed together in the next major version. An entry that fails two weekly live runs in a row with no replacement page is deprecated.

Implemented by `deprecated` in [`src/providers/types.ts`](../../src/providers/types.ts), handled in `getStatus` ([`src/status/get-status.ts`](../../src/status/get-status.ts)), `is-down list` ([`src/cli/commands/list.ts`](../../src/cli/commands/list.ts)), the generated `@deprecated` JSDoc ([`scripts/generate-providers.ts`](../../scripts/generate-providers.ts)), and the live check ([`tests/live.ts`](../../tests/live.ts)). Documented in [`docs/providers.md`](../../docs/providers.md#retiring-a-service). Locked by "deprecated providers return an error without a request" in [`tests/specs/get-status.ts`](../../tests/specs/get-status.ts) and "marks deprecated entries" in [`tests/specs/cli/list.ts`](../../tests/specs/cli/list.ts).

## Problem

The catalog has about 760 entries, and providers keep changing. The first weekly live run, on 2026-11-02, found 5 broken entries ([#5](https://github.com/privatenumber/is-down/issues/5)):

| Entry | Cause | Outcome |
| --- | --- | --- |
| `bolt` | Bolt moved its domain to `boltapp.com` | New URL |
| `datadog`, `datadogeu` | Moved to Datadog Status Pages, which has no compatible API ([datadog/status-pages.md](../datadog/status-pages.md)) | `platform: 'other'` |
| `halp` | Atlassian stopped selling Halp in May 2023 and discontinued it in 2024 ([Atlassian Community](https://community.atlassian.com/forums/discussion/2293388/the-evolution-of-halp-into-jira-service-management-cloud)). `status.halp.com` returned NXDOMAIN on 2026-11-04. | Deprecated |
| `datastax` | `status.astra.datastax.com` became a CNAME to an IBM OpenShift router that serves an unrelated "IBM Watson IoT" 404 page. `status.datastax.com` shows "Page Inactive", and `datastax.statuspage.io` returns 401. | Waiting for a second failed run |

The first two kinds keep the ID. The last two cannot be fixed with data, but each entry is a named export (`import { halp } from 'is-down/providers'`), and [`docs/providers.md`](../../docs/providers.md) states "Renaming or removing an ID is a breaking change". `is-down@1.0.0` was published on 2026-10-28, so that promise binds.

## Rejected alternatives

- **Remove each dead entry in its own major release.** Correct once, but services shut down often enough that majors would come every few weeks and stop signaling real API changes.
- **Never remove entries.** The [tz database](https://data.iana.org/time-zones/tz-link.html) keeps old zone names as links. A dead status page has nothing to link to, so the entry would fail forever and keep the weekly check red.
- **Redefine the promise so removals are minor.** Removing a named export still breaks TypeScript builds that import it, whatever the docs say.

The chosen model matches [simple-icons](https://github.com/simple-icons/simple-icons), which also exports one entry per name. Its [removal issue template](https://github.com/simple-icons/simple-icons/blob/develop/.github/ISSUE_TEMPLATE/icon_removal.yml) labels removals `breaking change` and asks for a link when "the brand no longer exists", and its majors remove icons in batches (accessed 2026-11-04).

## Why two failed runs

DataStax's page broke between about 2026-10-30 and 2026-11-02 and points at IBM infrastructure, so it may be a migration in progress. One failure can also be a provider outage: Bolt's `bolt.com` outage on 2026-10-02 resolved within days. Two weekly runs separate lasting breakage from those cases at the cost of one week.

## When to revisit

- If deprecations pile up faster than majors ship, consider a scheduled major for catalog removals.
- If a deprecated service comes back with a working page, remove `deprecated` and update `url`.
