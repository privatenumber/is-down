# incident.io Statuspage-compatible API

incident.io pages serve `/api/v2/summary.json` and `/api/v2/incidents.json` in the Statuspage shape, but not the single-incident endpoint. Their incident IDs are ULIDs, which tells a client which platform it is reading before it sends a request.

Observed 2026-10-31 on `status.clerk.com`, `status.axiom.co`, and `status.aiven.io` with Node.js v24.22.1 `fetch`, using the same requests as the [Statuspage evidence script](../statuspage/public-api.md#evidence-script).

## Differences from Statuspage

| | Statuspage | incident.io |
| --- | --- | --- |
| `page.id` length | 12 | 26 |
| `summary.json` has `incidents` | yes | **no** |
| `incidents.json` size | 50 incidents | 25 incidents, 35-68 KB uncompressed |
| `/api/v2/incidents/<id>.json` | 200 JSON, 2-11 KB | **404 HTML, 271-288 KB uncompressed, 1.1-1.2 s** |
| Incident `components` | present | **absent** |
| Incident IDs | `^[a-z0-9]{12}$` | ULID, `^[0-9A-HJKMNP-TV-Z]{26}$`, for example `01M64BZ539EBV61Y908QHE84C4` |
| Update keys | `id, status, body, created_at, display_at, ...` | `id, body, created_at, display_at, incident_id, status, updated_at` |
| `summary.json` cache | `max-age=10` | `public, max-age=0, must-revalidate` |

All 25 IDs on each of the three pages matched the ULID pattern. With `curl --compressed`, the 404 page for one Clerk incident transferred about 48 KB in about 1 s.

The 404 is the status page's HTML "not found" page, so it is returned for every ID, existing or not. A client that tries the single-incident endpoint first pays that cost on every lookup.

Because incidents have no `components`, a client cannot tell which components an incident affects.

## Documented incident.io APIs

- The [Status Page API](https://docs.incident.io/status-pages/api) and the [v2 API](https://docs.incident.io/api-reference/introduction) require an API key.
- The [Widget API](https://docs.incident.io/status-pages/api#widget-api) at `/api/v1/summary` is unauthenticated but opt-in per page: "If the widget API is disabled, the endpoint returns a `404`." It has no single-incident endpoint.
- The status page frontend loads incidents from `/proxy/<host>/incidents/<id>`, which returned 200 for a Clerk incident. It is undocumented, so it is not a contract.

The ULID shape is an observation, not a guarantee. The compatibility policy of incident.io's authenticated API lists "Altering the format or length of IDs" among backwards-compatible changes ([introduction](https://docs.incident.io/api-reference/introduction), accessed 2026-10-31). Whether that policy also covers status page incident IDs is not documented.
