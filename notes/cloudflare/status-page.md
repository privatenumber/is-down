# Cloudflare status page

Cloudflare lists each data center as a component, and dozens of them are not operational at almost any time. Its product components are degraded only while an incident is open. So the page indicator and an unscoped component check are never green, while the product components follow real incidents.

Observed 2026-10-31 with Node.js v24.22.1 `fetch`, on the live page and on [Wayback Machine](https://web.archive.org) captures of `https://www.cloudflarestatus.com/api/v2/summary.json`. `pnpm audit-status cloudflare --history` reruns the counts.

## Component groups

On 2026-10-31, `summary.json` had 8 groups and no ungrouped components:

| Group | Components | Not operational |
| --- | --- | --- |
| Cloudflare Sites and Services | 131 | 0 |
| Asia | 98 | 20 |
| North America | 63 | 9 |
| Europe | 61 | 5 |
| Latin America & the Caribbean | 52 | 9 |
| Africa | 33 | 10 |
| Middle East | 22 | 4 |
| Oceania | 13 | 2 |

Every group except "Cloudflare Sites and Services" holds data centers, named like `Sydney, Australia - (SYD)`. The page indicator was `major` ("Partial System Outage") with no open incident and no maintenance in progress, so Cloudflare derives the indicator from component statuses, including data centers.

## Data centers are never all operational

Wayback Machine captures, at most one per hour, from 2022-12-11 to 2026-10-27:

| Measure | Result |
| --- | --- |
| Captures | 374 |
| Any component not operational | 100% |
| Indicator not `none` | 100% |
| A "Cloudflare Sites and Services" component not operational | 49.2% |

In the 194 captures from 2025 and later, 32 to 78 data centers were not operational (median 51). Their statuses, summed over those captures: 5,223 `partial_outage`, 4,009 `under_maintenance`, 734 `degraded_performance`, 319 `major_outage`.

Captures are not a uniform sample. They cluster in early 2025, and people may archive the page more often during outages, which would raise the product share. The incident-time measure below does not have this bias.

## Product components follow incidents

In a sample of 125 of those captures, product components were not operational in 62. Every one of the 62 had an open incident. Statuses were `degraded_performance` (89 component-captures) or `major_outage` (3). The most frequent were Billing (29), WARP (10), and Cloudflare One Client (5).

## Incidents

From `incidents.json` on 2026-10-31 (the 50 most recent incidents, about 14 days):

- 44 of 50 incidents link components. Most link products, such as Durable Objects, R2, or Workers. Some link only data centers, such as "Network Performance Issues in Ashburn, IAD".
- Most are `minor` and regional, such as "Increased Errors for Durable Objects in the Eastern North America region".
- Over 14 days, incidents with an impact other than `none` that link a product component or no component were open 24.2% of the time; `major` or `critical` ones 5.6%. Incidents open longer than 7 days are excluded, because one ("Incorrect geo location for some Cloudflare WARP users") stayed open 56 days and would dominate the share.

For comparison over the same window: GitHub 9.3%, Netlify 6.6%, npm 2.3%, Vercel 0.3%, Node.js 0.0%.
