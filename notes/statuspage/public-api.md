# Statuspage public API

Statuspage pages serve three unauthenticated JSON endpoints that is-down reads. Incident IDs are 12 lowercase alphanumeric characters, a single incident can be fetched by ID, and update timestamps are not always UTC.

Observed 2026-10-31 on `www.githubstatus.com`, `status.npmjs.org`, `www.cloudflarestatus.com`, `status.twilio.com`, and `discordstatus.com` with Node.js v24.22.1 `fetch` (the [evidence script](#evidence-script) below reruns every check).

## Endpoints

| Endpoint | Observed |
| --- | --- |
| `/api/v2/summary.json` | Page, overall status, components, and an `incidents` array of unresolved incidents. `page.id` is 12 characters. |
| `/api/v2/incidents.json` | The 50 most recent incidents, newest first. 110-354 KB uncompressed. |
| `/api/v2/incidents/<id>.json` | One incident as `{ incident }`, 2-11 KB. |

## Incident IDs

All 50 IDs on each of the five pages matched `^[a-z0-9]{12}$`, for example `lyyfm7j4pkgl` on githubstatus.com.

## Unknown incident IDs

`/api/v2/incidents/zzzzzzzzzzzz.json` returns HTTP 404 with a small JSON body. The body is not uniform across pages:

```text
githubstatus, npm, twilio, discord: {"errors":["Could not find an item with that id."]}
cloudflarestatus:                   {"errors":[{"code":1002,"message":"incident not found"}],"messages":[],"success"...
```

## Incidents and updates

Incident keys: `id, name, status, created_at, updated_at, monitoring_at, resolved_at, impact, shortlink, started_at, page_id, incident_updates, components, reminder_intervals`.

Update keys: `id, status, body, incident_id, created_at, updated_at, display_at, affected_components, deliver_notifications, custom_tweet, tweet_id`. Every update carries the incident's `status` at the time it was posted.

Components on an incident include their `name` (keys start with `id, name, status, created_at` on npm, cloudflare, and twilio), so an incident can be rendered without the summary.

## Timestamps can carry a local offset

Some pages return local times with an offset instead of UTC:

```text
www.githubstatus.com  2026-10-30T23:29:06.291Z
status.twilio.com     2026-10-30T15:28:12.400-07:00
discordstatus.com     2026-10-30T09:18:51.314-07:00
```

Comparing these strings does not order them by time. Across a daylight saving change, `2026-11-01T01:10:00-08:00` (09:10Z) sorts before `2026-11-01T01:40:00-07:00` (08:40Z) although it is later. Mixed precision breaks string order too: `...:02Z` sorts after `...:02.207Z`. Parse with `Date.parse()` before comparing.

## Caching

githubstatus.com, npm, twilio, and discord return `cache-control: max-age=10, public, s-maxage=10, stale-while-revalidate=20, stale-if-error=3600` on `summary.json`. Cloudflare returned no `cache-control`. Polling more often than every 10 seconds returns cached data on those pages.

## Evidence script

```js
const page = 'https://www.githubstatus.com'

const get = async (path) => {
    const response = await fetch(`${page}${path}`, {
        headers: { accept: 'application/json' }
    })
    return {
        status: response.status,
        cache: response.headers.get('cache-control'),
        body: await response.text()
    }
}

const list = await get('/api/v2/incidents.json')
const { incidents } = JSON.parse(list.body)
const [incident] = incidents
console.log(incidents.length, incidents.every(item => /^[a-z0-9]{12}$/.test(item.id)))
console.log(Object.keys(incident.incident_updates[0]), incident.incident_updates[0].created_at)

const single = await get(`/api/v2/incidents/${incident.id}.json`)
const missing = await get('/api/v2/incidents/zzzzzzzzzzzz.json')
const summary = await get('/api/v2/summary.json')
console.log(single.status, missing.body, summary.cache)
```
