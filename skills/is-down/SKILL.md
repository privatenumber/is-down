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

## Node.js API

```ts
import { getStatus } from 'is-down'
import { npm, github } from 'is-down/providers' // One named export per provider ID

const result = await getStatus(npm, { components: ['install'], since: 60 * 60 * 1000 })
// result.state: 'operational' | 'degraded' | 'error'

await getStatus('https://status.example.com') // Any Statuspage-compatible page
```

`getStatus` checks one page; use `Promise.all` for several. It times out after 10 seconds by default; a passed `signal` replaces that timeout. Network failures, page failures, and timeouts are returned as `state: 'error'`. It throws only for an invalid URL, and rejects when `signal` aborts for another reason.

Read the [CLI docs](https://github.com/privatenumber/is-down/blob/develop/docs/cli.md) when you need a CLI flag, selector form, or degraded rule not shown here, and the [Node.js API docs](https://github.com/privatenumber/is-down/blob/develop/docs/node.md) when you need a `getStatus` option or result field not shown here.
