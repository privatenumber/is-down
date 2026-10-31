# Providers

The catalog maps services to their status pages. It is published in two forms:

| Import | Contents | Use it for |
| --- | --- | --- |
| `is-down/providers` | One named export per provider | JavaScript. Bundles include only the providers you import. |
| `is-down/providers.json` | Every provider as JSON, keyed by ID | Tools in other languages |

```ts
import { npm, github, type Provider } from 'is-down/providers'
```

To get every provider, use a namespace import. This loads the whole catalog:

```ts
import * as providers from 'is-down/providers'

const all = Object.values(providers)
```

Export names are the provider IDs. IDs are lowercase letters and digits that start with a letter, such as `github` or `googlecloud`. Services whose names start with a digit use a spelled-out ID, such as `onepassword`, and keep the original name as an alias.

## Schema

```ts
type Provider = {
    // Catalog ID. Not included in providers.json, where it is the key.
    id: string

    name: string

    // Status page URL. An origin for `statuspage` and `incident.io` pages.
    url: string

    // `statuspage`: Atlassian Statuspage
    // `incident.io`: incident.io, with a Statuspage-compatible API
    // `other`: no Statuspage-compatible API. `url` is for people to open.
    platform: 'statuspage' | 'incident.io' | 'other'

    // Alternative IDs accepted by the CLI, such as `gh` for `github`
    aliases?: string[]

    // Domains owned by the service. Subdomains match too:
    // `npmjs.org` covers `registry.npmjs.org`.
    domains: string[]

    // Selector aliases mapped to exact component names, such as `{ "pr": "Pull Requests" }`
    components?: Record<string, string>

    // Placeholder components that carry no status
    ignoreComponents?: string[]

    // Exact component or group names that checks without a selector cover,
    // for pages where the other components are rarely all operational
    defaultScope?: string[]
}
```

For `statuspage` and `incident.io` pages, the API is at `${url}/api/v2/summary.json` and `${url}/api/v2/incidents.json`.

## Guarantees

These rules are enforced by tests:

- IDs are valid JavaScript identifiers.
- IDs and aliases are unique, and none is `defaults` or `list`.
- Each domain belongs to one provider.
- URLs use https.

`pnpm test:live` also checks that every name in `components`, `ignoreComponents`, and `defaultScope` exists on the live page.

IDs are part of the public interface. Renaming or removing an ID is a breaking change.

## Adding a service

1. Add an entry to [`src/providers/providers.json`](../src/providers/providers.json). Keep keys sorted.
2. Set `platform` by opening `<url>/api/v2/summary.json`: a Statuspage-shaped response with a 12-character `page.id` is `statuspage`, a 26-character `page.id` is `incident.io`, and anything else is `other`.
3. Add the domains the service uses, especially API and registry domains that appear in error messages.
4. Run `pnpm generate-providers` to update `src/providers/index.ts`, which is generated from the JSON. `pnpm test` fails if it is out of date.
5. Run `pnpm test` and `pnpm test:live`.

### Finding candidates

`pnpm import-providers` reads third-party indexes, checks each page that is not in the catalog yet, and prints new candidates. The indexes are dev dependencies, [`@sentry/status-page-list`](https://github.com/getsentry/status-page-list) and [isUpMap](https://github.com/Jaironlanda/isupmap) (pinned to a commit), so Renovate opens a PR when either changes. Run the script after such an update to find new services. `pnpm import-providers --write` adds them to `src/providers/providers.json`. Existing entries are never changed. Review the names and IDs it picks, then run `pnpm generate-providers`.

[NOTICE](../NOTICE) carries the licenses of the sources. `pnpm test` fails when a dependency update changes a source's license, so copy the new `LICENSE` text into NOTICE when that happens.

## Accuracy

A scheduled workflow runs `pnpm test:live` every week. It checks that every page still responds and that `statuspage` and `incident.io` pages still serve a compatible API, and opens an issue when an entry breaks.
