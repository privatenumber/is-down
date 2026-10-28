/**
 * - `statuspage`: Atlassian Statuspage
 * - `incident.io`: incident.io, which serves a Statuspage-compatible API
 * - `other`: a status page without a Statuspage-compatible API. `url` is for people to open.
 */
export type Platform = 'statuspage' | 'incident.io' | 'other';

export type Provider = {

	/** Catalog ID. Also the export name in `is-down/providers`. */
	id: string;
	name: string;

	/** Status page URL. An origin for `statuspage` and `incident.io` pages. */
	url: string;
	platform: Platform;

	/** Alternative IDs accepted by the CLI */
	aliases?: string[];

	/** Domains owned by the service. Subdomains match too. */
	domains: string[];

	/** Component selector aliases mapped to exact component names */
	components?: Record<string, string>;

	/** Placeholder components that carry no status */
	ignoreComponents?: string[];
};
