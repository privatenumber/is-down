# CLI

```
is-down [flags...] [services...]
is-down list [query] [--json]
is-down watch <incident> [--until-update] [--max-wait <duration>]
```

With no services, `is-down` checks the defaults: npm, GitHub, Node.js, Vercel, Cloudflare, and Netlify.

## Services

Each argument is one of:

| Form | Example | Checks |
| --- | --- | --- |
| `defaults` | `defaults` | The default services. Combine it with other services, such as `defaults discord`. |
| Catalog ID or alias | `npm`, `gh` | The whole service |
| Component selector | `npm:install`, `github:actions` | Only the matching components |
| Service URL or domain | `https://registry.npmjs.org/react`, `github.com` | The status page of the catalog service that owns the domain |
| Status page URL | `https://status.example.com` | Any Statuspage-compatible page |
| Status page URL with component | `https://status.example.com#builds` | Only the matching components |
| Incident URL | `https://status.npmjs.org/incidents/56x3sh4qhr9s` | The page, plus that incident regardless of age |

A domain without `https://` must belong to a catalog service. Anything else is an unknown service, so a typo never sends a request to an unrelated website. To check a status page that is not in the catalog, pass its full URL.

Run `is-down list` to see the catalog of about 760 services. Arguments for the same status page are checked together with one request. A page is scoped to components only when every argument for it has a selector, so `defaults npm:install` checks all of npm.

### Component selectors

A selector matches component names and component group names, case-insensitively:

- A single word matches the start of any word. `install` matches "Package installation", and `cdn` matches every component in Vercel's "CDN" group.
- Anything else matches as a substring. `"pull requests"` matches "Pull Requests".
- Some catalog entries define short aliases, such as `github:pr`.

A selector that matches nothing is an error, and the error lists the available components.

## What counts as degraded

Without a selector, a service is degraded when its page reports any problem, any component is not operational, or an incident is active.

With a selector, only the selected components count:

- A selected component that is not operational, including one under maintenance.
- An active incident linked to a selected component.
- An active incident linked to no components. Some status pages, including all incident.io pages, never link incidents to components, so these incidents are treated as affecting every component.

Incidents with an impact of `none` are shown but do not count as degraded.

## Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--since <duration>` | `1h` | Also show incidents resolved within this window, such as `30m`, `6h`, `2d`, or `1h30m`. `0` disables it and skips the extra request. Resolved incidents never affect the exit code. |
| `--timeout <ms>` | `10000` | Request timeout per status page. |
| `--json` | | Print results as JSON. The shape matches `ServiceResult` in the [Node.js API](node.md). |
| `--help` | | Show help. |
| `--version` | | Show the version. |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Everything checked is operational. |
| `1` | At least one service is degraded. This takes precedence over code `2`. |
| `2` | A status page could not be read, the input is invalid, or a selector or incident was not found. |

## Output

While the checks run in an interactive terminal, a line per service updates as each result arrives. It is drawn on stderr and replaced by the final output, so pipes, CI logs, and `--json` only receive the results.

Each service prints one line. Operational services show only a ✓ and their name, so problems stand out. In terminals that support hyperlinks, the name links to the service's status page. A service that needs attention also shows its status, followed by details:

- Components that are not operational. When more than three components in one group are affected, such as Cloudflare data centers, the group is summarized in one line.
- Active incidents, with their stage, age, latest update, affected components, and the [`watch`](#watch) command that follows them.
- Incidents resolved within the `--since` window.

## `list`

```
is-down list [query] [--json]
```

Lists the catalog. A query matches the start of any word in an entry's ID, aliases, name, or domains, so `is-down list google` finds every Google service. A query with a dot matches domains, so `is-down list registry.npmjs.org` finds npm.

```
$ is-down list gh
SERVICE         STATUS PAGE
ghostinspector  ghostinspector.statuspage.io
github, gh      www.githubstatus.com

2 of 762 services match "gh". Check one with: is-down <service>
```

The first column lists the ID and aliases, which are what `is-down` accepts. Entries marked "(not checkable)" have no compatible status API; checking one prints the page to open. When no service matches, `list` exits `2`.

`--json` prints the matching entries keyed by ID, in the same shape as [`is-down/providers.json`](providers.md).

## `watch`

```
is-down watch <incident> [--until-update] [--max-wait <duration>]
```

Follows one incident and prints each update as it is posted, until the incident resolves. `<incident>` is an incident URL, such as the one `is-down` prints under each active incident.

```
$ is-down watch https://status.npmjs.org/incidents/abc123
● Increased error rates for package installs [major] · started 42m ago · https://status.npmjs.org/incidents/abc123
  identified · The issue has been identified and a fix is being implemented.
  monitoring · A fix has been deployed. We are monitoring the results.
  resolved · This incident has been resolved.
✓ Resolved · lasted 1h12m
```

The first lines show the incident and its latest update. After that, each new update prints as one line, and so does a check that fails. A failed request, such as a timeout or HTTP 5xx, does not stop the watch, even on the first check. The incident is checked once a minute.

| Flag | Description |
| --- | --- |
| `--until-update` | Exit after the next check that finds new updates, instead of waiting for the incident to resolve. Every update from that check is printed, and the last line is the command to run again to keep watching. |
| `--max-wait <duration>` | Stop after this long, such as `10m` or `1h`, and exit `124`. Must be longer than `0`. |

| Exit code | Meaning |
| --- | --- |
| `0` | The incident resolved, or had already resolved. |
| `1` | A new update was posted and the incident is still active. Only with `--until-update`. |
| `124` | `--max-wait` was reached and the incident is still active. |
| `2` | The incident was not found, the page is not a supported status page, or the input is not an incident URL. These are checked until the first successful check; after that, failures only print a line. |

### Watching from an agent

Some agent harnesses only report a background command when it exits. Run `watch` with `--until-update` there, so each update ends the command. Start the same command again in the background before acting on the updates. The new watch prints the latest update first. So if one update is posted between the two runs, it still shows. If several are, only the newest shows, and a rerun can show an update the previous run already printed.

Harnesses that report each output line while a command runs can watch without `--until-update`. Set `--max-wait` below the harness's time limit for background commands.

## `skills`

```
is-down skills [--install <directory>]
```

Prints the [agent skill](../skills/is-down/SKILL.md) bundled with this version of `is-down`.

`--install <directory>` copies the skill into `<directory>/is-down/` instead, so pass the skills directory your agent reads:

```sh
is-down skills --install ~/.agents/skills   # Agents that read ~/.agents/skills
is-down skills --install ~/.claude/skills   # Claude Code
is-down skills --install .agents/skills     # Only this project
```

Missing directories are created, and an earlier copy is overwritten, so run it again to update the skill. A leading `~` is expanded even in `--install=~/...`, where the shell leaves it alone.

## Supported status pages

`is-down` reads the Atlassian Statuspage API (`/api/v2/summary.json` and `/api/v2/incidents.json`). incident.io pages serve a compatible API and are supported too.

Some catalog entries, such as AWS, Google Cloud, Slack, and GitLab, use status pages without a compatible API. They are listed so `is-down` can point to the right page: checking one exits `2` with a link to open. `is-down list` marks them as "not checkable".

See [Providers](providers.md) to add a service to the catalog.
