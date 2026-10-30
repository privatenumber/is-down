# Node.js API

```ts
import { getStatus } from 'is-down'
import { npm, github } from 'is-down/providers'

const [npmStatus, githubStatus] = await Promise.all([
    getStatus(npm, { components: ['install'] }),
    getStatus(github)
])

if (npmStatus.state === 'degraded') {
    console.log(npmStatus.incidents)
}
```

Providers are imported by name from [`is-down/providers`](providers.md), so a bundle only includes the providers it uses. The `is-down` entry itself contains no provider data.

## `getStatus(target, options?)`

Checks one status page and returns a `ServiceResult`. `target` is either:

- A provider from `is-down/providers`, or any object of the `Provider` type.
- The URL of a Statuspage-compatible page, such as `'https://status.example.com'`. Only the origin is used.

To check several pages, call `getStatus` for each one with `Promise.all`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `components` | `string[]` | Every component | Component selectors to scope the check to, matched against component and group names. See [component selectors](cli.md#component-selectors). |
| `incidents` | `string[]` | | Incident IDs to include in `requestedIncidents`, regardless of age |
| `since` | `number` | `3600000` (1 hour) | Include incidents resolved within this many milliseconds. `0` disables it and skips a request. |
| `signal` | `AbortSignal` | `AbortSignal.timeout(10_000)` | Aborts the check. A passed signal replaces the default timeout. |

Network failures, timeouts, unsupported pages, unmatched selectors, and providers with `platform: 'other'` do not throw. They are returned as results with `state: 'error'`. A timeout is a `signal` that aborts with a `TimeoutError`, such as `AbortSignal.timeout(10_000)`.

To cancel a check and keep a timeout, combine the signals: `AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])`.

`getStatus` throws only when `target` is not a valid URL, and rejects with the signal's reason when `signal` aborts for any reason other than a timeout.

### `ServiceResult`

```ts
type ServiceResult = {
    id?: string // Catalog ID, when the page is in the catalog
    name: string
    url: string // Status page root URL
    scope?: string[] // The `components` option, when the check is scoped
} & ({
    state: 'operational' | 'degraded'
    description: string // For example "All Systems Operational"
    components: Component[] // Components in scope, including operational ones
    incidents: Incident[] // Unresolved incidents that affect the scope
    recentIncidents: Incident[] // Resolved within `since` and affected the scope
    requestedIncidents: Incident[] // Incidents requested by URL
} | {
    state: 'error'
    error: string
})

type Component = {
    name: string
    group?: string
    status: 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage' | 'under_maintenance'
}

type Incident = {
    id: string
    name: string
    status: string // investigating, identified, monitoring, resolved, or postmortem
    impact: string // none, minor, major, or critical
    url: string
    startedAt: string
    resolvedAt?: string
    latestUpdate?: IncidentUpdate
    components: string[] // Empty when the page doesn't link incidents to components
}

type IncidentUpdate = {
    status: string // The incident's status as of this update
    body: string
    createdAt: string
}
```

## `watchIncident(url, options?)`

Watches one incident and returns an async iterator of `IncidentEvent`s. `url` is the URL of an incident on a Statuspage-compatible page, such as the `url` of an `Incident`.

```ts
import { watchIncident } from 'is-down'

for await (const event of watchIncident('https://status.npmjs.org/incidents/abc123')) {
    if (event.type === 'update') {
        console.log(event.update.status, event.update.body)
    }
}

// The loop ends when the incident resolves
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `interval` | `number` | `60000` (1 minute) | Milliseconds between checks |
| `timeout` | `number` | `10000` | Request timeout per check in milliseconds |
| `signal` | `AbortSignal` | | Stops the watch |

The iterator yields these events:

```ts
type IncidentEvent = {
    type: 'incident' // The first successful check
    incident: Incident
} | {
    type: 'update' // An update posted after the first check
    incident: Incident
    update: IncidentUpdate
} | {
    type: 'error' // A check that failed. The watch continues.
    error: string
}
```

The first event shows the incident's current state, including its latest update. An `update` event's `incident` is the incident as of that check. After the check that finds the incident resolved, the iterator finishes. If the incident had already resolved, the first event is the last.

Failed checks, including timeouts and a missing incident, are yielded as `error` events, and the next check runs after `interval`. To stop on errors, such as an incident that does not exist, break out of the loop.

To stop watching, break out of the loop or abort `signal`. When `signal` aborts, the iterator rejects with the signal's reason. To stop after a limit, pass `AbortSignal.timeout(ms)` and handle its `TimeoutError`.

`watchIncident` throws at the call when `url` is not a valid URL or not an incident URL.

