---
name: is-down
description: An external service or API is failing, hanging, or timing out; asking whether a service is down; or running `is-down` or importing from `is-down`. Not for failures already traced to local code, configuration, or credentials.
---

# is-down

Reads Statuspage-compatible status pages and reports components that are not operational, active incidents, and recently resolved incidents.

## CLI

```sh
npx is-down                                   # npm, GitHub, Node.js, Vercel, Cloudflare, Netlify
npx is-down defaults discord                  # Defaults plus Discord
npx is-down npm:install github:git            # Only these components
npx is-down https://registry.npmjs.org/react  # URL from an error message
npx is-down "https://status.example.com#api"  # Any Statuspage-compatible page
npx is-down github --since 6h --json          # Include incidents resolved in the last 6h
npx is-down list google                       # Search the catalog
```

Catalog entries marked "not checkable" in `is-down list` have no readable status API; checking one exits `2` with the status page link to open.

Exit codes: `0` operational, `1` degraded (takes precedence), `2` page unreachable, unsupported, or invalid input.

When diagnosing a failure, scope the check to the component that failed, such as `npm:install` for install errors or `github:actions` for workflow errors. Use `--since` with a window that covers the failure time; resolved incidents are listed but don't change the exit code. An unmatched selector exits `2` and lists the page's components.

## Watching an incident

Each active incident in the output ends with a `Watch: npx is-down watch <incident-url>` line. Run it in the background to follow the incident instead of polling:

- If your harness reports a background command only when it exits, add `--until-update`. Exit `1` means new updates were posted, and all of them are printed. Start the same command again in the background before acting on them. The new run first prints the latest update, which you may have already seen.
- If your harness reports each output line as it arrives, run it without `--until-update`. Each line is one event.
- Exit `0` means the incident resolved: retry the action that failed.
- Set `--max-wait` below your harness's time limit for background commands. Exit `124` means the incident is still active; run the same command again to keep watching.
- Exit `2` means the incident was not found or the page is not a supported status page. Check the URL instead of rerunning. Failed requests, such as HTTP 5xx, print a line and the watch continues.

## Node.js API

```ts
import { getStatus, watchIncident } from 'is-down'
import { npm, github } from 'is-down/providers' // One named export per provider ID

const result = await getStatus(npm, { components: ['install'], since: 60 * 60 * 1000 })
// result.state: 'operational' | 'degraded' | 'error'

await getStatus('https://status.example.com') // Any Statuspage-compatible page

// Yields 'incident', then 'update' with each check's new updates, and 'error' for failed checks.
// Finishes when the incident resolves; rejects with the reason when `signal` aborts.
for await (const event of watchIncident(incident.url, { signal })) { /* ... */ }
```

`getStatus` checks one page; use `Promise.all` for several. It times out after 10 seconds by default; a passed `signal` replaces that timeout. Network failures, page failures, and timeouts are returned as `state: 'error'`. It throws only for an invalid URL, and rejects when `signal` aborts for another reason.

Read the [CLI docs](https://github.com/privatenumber/is-down/blob/develop/docs/cli.md) when you need a CLI flag, selector form, or degraded rule not shown here, and the [Node.js API docs](https://github.com/privatenumber/is-down/blob/develop/docs/node.md) when you need a `getStatus` or `watchIncident` option, result field, or event not shown here.
