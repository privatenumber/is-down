# Incident impact and the page indicator

Statuspage computes an incident's `impact` from the statuses of the components the incident affects, and the page's `status.indicator` from all components. `minor` means at least one affected component has degraded performance or a partial outage, so it describes real failures for some users, not cosmetic issues. Source: [Top-level status and incident impact calculations](https://support.atlassian.com/statuspage/docs/top-level-status-and-incident-impact-calculations/), accessed 2026-11-04.

## Incident impact

The rules apply in order, and the first match wins:

| Affected components | Impact |
| --- | --- |
| All operational | `none` |
| All major outage | `critical` |
| All partial outage | `major` |
| Any major outage | `major` |
| Any partial outage | `minor` |
| All or any degraded performance | `minor` |
| Any under maintenance | `maintenance` |

The page admin can override the computed impact from the incident's impact menu. The management API exposes this as `impact_override` ([API reference](https://developer.statuspage.io)). The public API returns only the effective `impact`.

## How often each impact occurs

From `incidents.json` on 2026-11-04 (each list holds the 50 most recent incidents):

| Page | Span | none | minor | major | critical |
| --- | --- | --- | --- | --- | --- |
| npm | 915 days | 2 | 37 | 10 | 1 |
| GitHub | 72 days | 1 | 33 | 4 | 12 |
| Vercel | 163 days | 7 | 25 | 16 | 1 |
| Cloudflare | 14 days | 4 | 41 | 5 | 0 |
| Netlify | 195 days | 11 | 27 | 9 | 3 |
| Node.js | 1,329 days (5 incidents) | 1 | 2 | 1 | 1 |

Vercel also had one `maintenance` incident. Examples of `minor` incidents in the same lists: npm "Degraded Publish, Install, and View Package", GitHub "Incident with Git Operations", Node.js "Intermittent 404s downloading Node.js", Netlify "Elevated Build Errors" and "Error accessing Netlify-hosted sites".
