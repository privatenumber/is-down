# Engineering research notes

Tracked maintainer references for the status page APIs, libraries, and agent harnesses that shape is-down. They are not part of the published package (`package.json#files` lists only `dist`, `docs`, `skills`, and `NOTICE`).

## Ownership

Each upstream folder owns that tool's behavior, implementation, configuration, and version boundaries. The is-down folder owns project policy, integration, and cross-tool synthesis, and links to upstream evidence.

## Index

| Folder | Owns |
| --- | --- |
| [statuspage/](./statuspage/README.md) | Atlassian Statuspage public API: endpoints, incident IDs, update timestamps, caching |
| [incident-io/](./incident-io/README.md) | incident.io's Statuspage-compatible public API and how it differs from Statuspage |
| [cloudflare/](./cloudflare/README.md) | Cloudflare's status page: data-center components and incident patterns |
| [ansis/](./ansis/README.md) | How the `ansis` color library detects color support |
| [node/](./node/README.md) | Node.js `util.styleText` color decisions |
| [claude-code/](./claude-code/README.md) | How Claude Code delivers output from long-running commands |
| [opencode/](./opencode/README.md) | How OpenCode delivers output from long-running commands |
| [codex/](./codex/README.md) | How Codex delivers output from long-running commands |
| [is-down/](./is-down/README.md) | Project decisions: incident lookup, the `watch` command design, terminal styling, default scopes |

## Evidence

Cite upstream facts beside the claim using primary sources accessible to the intended readers, preferably pinned releases or commits. Ground project behavior in repository source or tests, and label decisions with their rationale. Distinguish documented and observed behavior from inference. Keep executable contracts in the test suite.

Status page responses change over time. Observations of live pages record the date and the exact request so they can be rerun.

## Maintenance

When upstream evidence changes, update the notes and identify affected project decisions and tests. Make implementation or packaging changes only when they are within the requested scope.
