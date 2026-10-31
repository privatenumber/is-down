# is-down

Project decisions, with the evidence and alternatives behind them.

- [incident-lookup.md](./incident-lookup.md): how one incident is fetched on Statuspage and incident.io pages, and how its updates are ordered.
- [watch.md](./watch.md): why `is-down watch` is a subcommand that follows one incident, how agents consume it, and the alternatives that were rejected.
- [terminal-styling.md](./terminal-styling.md): why output is styled with `util.styleText` and hyperlinks use ansis.
- [default-scope.md](./default-scope.md): why Cloudflare's default check covers only its products, and why a scheduled sampling job was rejected.
