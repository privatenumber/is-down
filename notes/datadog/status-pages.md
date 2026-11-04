# Datadog Status Pages

Datadog's own status pages, `status.datadoghq.com` (US1) and `status.datadoghq.eu` (EU1), moved from Atlassian Statuspage to [Datadog Status Pages](https://docs.datadoghq.com/incident_response/status_pages) in late 2026. They have no Statuspage-compatible API, so the catalog lists both as `platform: 'other'`.

Observed 2026-11-04 with `curl` and Node.js v24 `fetch`.

## The Statuspage API is gone

`GET https://status.datadoghq.com/api/v2/summary.json` returns `403` with an S3 error body:

```xml
<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>
```

Wayback Machine captures of that URL returned `200 application/json` through 2026-08-25 and `403 application/xml` on 2026-11-02 (`https://web.archive.org/cdx/search/cdx?url=status.datadoghq.com/api/v2/summary.json&output=json&from=2026`). The EU page behaves the same.

## What the new pages serve

- `/config.json`: the data the page's JavaScript renders. It has `components` (40 on US1, each with `name` and `status`) and `incidents` (758, back to 2014, each with `currentStatus`, `resolved`, `componentsAffected`, and `timeline`). It is 1.9 MB, or 290 KB with gzip, because it also holds base64 logos.
- `/history.rss` and `/history.atom`: incident history feeds, linked from the page as subscription options. They have no component status.

The documented [Status Pages API](https://docs.datadoghq.com/api/latest/status-pages) requires an API key and manages your own pages. No documented unauthenticated read API exists. The page's frontend loads its configuration from one of three sources with fallbacks between them, so `config.json` is an internal detail, not a contract.

## Decision: `other`, not an adapter

An adapter for `config.json` was rejected:

- It would depend on an undocumented format. The project rejected incident.io's undocumented `/proxy/` endpoint for the same reason ([incident-io/public-api.md](../incident-io/public-api.md#documented-incidentio-apis)).
- Each check would download about 290 KB, against a few KB for a Statuspage `summary.json`.
- On 2026-11-04, none of the 56 catalog entries with `platform: 'other'` served the Datadog Status Pages app (checked for the `status-pages-site` script in each page's HTML), so an adapter would serve only Datadog's own pages.

As `other`, `is-down datadog` reports that Datadog has no status API that is-down can read and links the page. The IDs and exports stay unchanged.

## When to revisit

- Datadog documents an unauthenticated read API for public status pages.
- Several services worth cataloging move to Datadog Status Pages. The product is used by "2000+ orgs" according to [a designer on the team](https://www.desaiwang.com/work/datadog-status-pages) (accessed 2026-11-04).
