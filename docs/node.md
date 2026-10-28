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
| `signal` | `AbortSignal` | `AbortSignal.timeout(5000)` | Aborts the check. A passed signal replaces the default timeout. |

Network failures, timeouts, unsupported pages, unmatched selectors, and providers with `platform: 'other'` do not throw. They are returned as results with `state: 'error'`. A timeout is a `signal` that aborts with a `TimeoutError`, such as `AbortSignal.timeout(5000)`.

To cancel a check and keep a timeout, combine the signals: `AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])`.

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
    latestUpdate?: {
        body: string
        createdAt: string
    }
    components: string[] // Empty when the page doesn't link incidents to components
}
```

