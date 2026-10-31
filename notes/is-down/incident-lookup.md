# Incident lookup

**Decision:** pick the endpoint from the incident ID's shape. A ULID-shaped ID means an incident.io page, so the incident is read from `/api/v2/incidents.json`. Any other ID uses Statuspage's `/api/v2/incidents/<id>.json` and falls back to the list on 404. This is stateless, and needs one request per check on every page observed.

Implemented in `fetchIncidentById` in [`src/status/statuspage.ts`](../../src/status/statuspage.ts). Locked by the tests "incident.io IDs are read from the incident list" and "other IDs fall back to the incident list when the incident endpoint returns 404" in [`tests/specs/watch-incident.ts`](../../tests/specs/watch-incident.ts).

## Evidence

- Statuspage IDs are `^[a-z0-9]{12}$`, and the single-incident endpoint returns 2-11 KB of JSON ([statuspage/public-api.md](../statuspage/public-api.md)).
- incident.io IDs are 26-character ULIDs, and the single-incident endpoint returns a 271-288 KB HTML 404 in about 1 s for every ID ([incident-io/public-api.md](../incident-io/public-api.md)).
- The 12 vs 26 character split matches how [`docs/providers.md`](../../docs/providers.md) classifies a page's `platform` from `page.id`.

## Rejected alternatives

- **Try the single endpoint, then the list, with no memory.** Simplest, but every check on an incident.io page downloads the HTML 404 first. At one check a minute, that is about 48 KB compressed and 1 s of latency per minute.
- **Remember the 404 after the first check.** Correct, but adds mutable state to the watch loop and still pays one 404.
- **Always read the list.** One request everywhere, but 110-354 KB per check on Statuspage pages instead of 2-11 KB, and old incidents drop out of the list (50 or 25 most recent).
- **incident.io's `/proxy/<host>/incidents/<id>`.** Works today but is the frontend's undocumented endpoint.
- **incident.io's documented APIs.** They need an API key, or the per-page opt-in Widget API, which has no single-incident endpoint.

## When to revisit

- If incident.io changes its ID format, IDs stop matching the ULID pattern and lookups fall back through the 404 again: still correct, but slow. incident.io does not document its status page IDs as stable ([incident-io/public-api.md](../incident-io/public-api.md#documented-incident-io-apis)).
- If incident.io adds a single-incident endpoint, or `pnpm test:live` shows a page whose IDs break the 12 or 26 character pattern.

## Update order

Updates are ordered and compared by `Date.parse(created_at)` (`updateTime` in [`src/status/evaluate.ts`](../../src/status/evaluate.ts)), not by string. Some Statuspage pages return local offsets such as `-07:00`, which string comparison misorders across a daylight saving change ([statuspage/public-api.md](../statuspage/public-api.md#timestamps-can-carry-a-local-offset)). Locked by "orders updates by time across a daylight saving change" in [`tests/specs/watch-incident.ts`](../../tests/specs/watch-incident.ts).
