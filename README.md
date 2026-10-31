# is-down

Check whether the services your code depends on are down, using their official status pages.

Your agent's `npm publish` just failed. Is it the code, or is npm down? The website can load fine while publishing is broken. `is-down` gives agents (and you) a one-command answer, down to the exact component.

```
$ npx is-down npm:install github:git vercel
! npm › Package installation  Partial Outage
    Package installation: partial outage
    ● Increased error rates for package installs [major] · identified · started 42m ago
      The issue has been identified and a fix is being implemented.
      Affected: Package installation
      Watch: npx is-down watch https://status.npmjs.org/incidents/abc123
✓ GitHub › Git Operations
✓ Vercel
```

`is-down` reads the [Statuspage](https://www.atlassian.com/software/statuspage) API that npm, GitHub, Vercel, Cloudflare, OpenAI, and many others publish, and exits nonzero when something you depend on is degraded. It ships an [agent skill](#agent-skill) so coding agents reach for it on their own.

## Usage

Check the default services (npm, GitHub, Node.js, Vercel, Cloudflare, Netlify):

```sh
npx is-down
```

Add to the defaults:

```sh
npx is-down defaults discord
```

Check only the parts you use. A Copilot outage won't fail a check scoped to Git and Actions:

```sh
npx is-down npm:install github:git github:actions
```

Paste the URL from an error message. Known service domains map to their status page:

```sh
npx is-down https://registry.npmjs.org/react
```

Check any Statuspage-compatible page, optionally scoped to a component:

```sh
npx is-down "https://status.example.com#builds"
```

Follow an incident until it resolves. Each update prints as it is posted, and the command exits when the incident resolves:

```sh
npx is-down watch https://status.npmjs.org/incidents/abc123 && npm publish
```

See what happened recently. Incidents resolved within the window are listed but don't affect the exit code:

```sh
npx is-down github --since 6h
```

Run it before a CI step to tell an upstream outage apart from a broken build:

```yaml
- run: npx is-down npm:install github:actions
```

| Exit code | Meaning |
| --- | --- |
| `0` | Everything checked is operational |
| `1` | Something checked is degraded or has an active incident |
| `2` | A status page could not be read, or the input is invalid |

Search the catalog of about 760 services:

```sh
npx is-down list google
```

See [CLI docs](docs/cli.md) for all options, and [Node.js API](docs/node.md) to use it from code.

## Agent skill

The package includes an [agent skill](skills/is-down/SKILL.md) that tells coding agents to check `is-down` when an external service fails, such as after a failed install, push, deploy, or API call.

Install it into the skills directory your agent reads:

```sh
npx is-down skills --install ~/.agents/skills   # Codex, OpenCode, and other agents that read ~/.agents/skills
npx is-down skills --install ~/.claude/skills   # Claude Code
npx is-down skills --install .agents/skills     # Only the current project
```

Run it again to update the skill. To read the skill without installing it, run `npx is-down skills`.

In projects that depend on `is-down`, pnpm can link the skill automatically after approval. See [pnpm agent skills](https://pnpm.io/agent-skills).

## Node.js API

```ts
import { getStatus } from 'is-down'
import { npm, github } from 'is-down/providers'

const results = await Promise.all([
    getStatus(npm, { components: ['install'] }),
    getStatus(github)
])
```

Providers are separate named exports, so a bundle includes only the ones you import. See [Node.js API](docs/node.md).

## Status page catalog

Every provider is also published as plain JSON at `is-down/providers.json`, for tools in other languages. See [Providers](docs/providers.md) for the schema and how to add a service.

The catalog was seeded from [@sentry/status-page-list](https://github.com/getsentry/status-page-list), [isUpMap](https://github.com/Jaironlanda/isupmap), and [Statusphere](https://github.com/metoro-io/statusphere). Their licenses are in [NOTICE](NOTICE).
