import type { ComponentStatus } from './component-status.ts';

export type ApiComponent = {
	id: string;
	name: string;
	status: ComponentStatus;
	group?: boolean;
	group_id?: string | null;
};

export type ApiIncidentUpdate = {

	/** The incident's status as of this update */
	status?: string;
	body: string;
	created_at: string;
	display_at?: string;
};

export type ApiIncident = {
	id: string;
	name: string;
	status: string;
	impact: string;
	created_at: string;
	started_at?: string;
	resolved_at?: string | null;
	incident_updates?: ApiIncidentUpdate[];

	/** Statuspage includes each component's name, which the summary also provides */
	components?: {
		id: string;
		name?: string;
	}[];
};

export type ApiSummary = {
	page: { name: string };
	status: {
		indicator: string;
		description: string;
	};
	components: ApiComponent[];

	/** Unresolved incidents. Omitted by incident.io pages. */
	incidents?: ApiIncident[];
};

/** Incident statuses after which no more updates are expected */
export const resolvedStatuses = new Set(['resolved', 'postmortem']);

/**
 * `request`: the request failed, which can be temporary, such as a network error or HTTP 5xx.
 * `unsupported`: the page answered, but not as a supported status page, which a retry won't fix.
 */
export type FailureKind = 'request' | 'unsupported';

/** An expected failure of a status page, reported as a result instead of thrown */
export class PageError extends Error {
	kind: FailureKind;

	constructor(message: string, kind: FailureKind = 'unsupported') {
		super(message);
		this.kind = kind;
	}
}

/**
 * Describes an expected failure of a request to `pageUrl`: a `PageError` or a timeout.
 * Rethrows anything else, such as an abort for another reason.
 */
export const describeFailure = (error: unknown, pageUrl: string): {
	kind: FailureKind;
	message: string;
} => {
	if (error instanceof PageError) {
		return {
			kind: error.kind,
			message: error.message,
		};
	}
	if (error instanceof DOMException && error.name === 'TimeoutError') {
		return {
			kind: 'request',
			message: `Timed out reaching ${pageUrl}`,
		};
	}
	throw error;
};

type FetchCause = {
	code?: string;
	message?: string;
};

const request = async (url: string, signal: AbortSignal) => {
	try {
		return await fetch(url, {
			signal,
			headers: { accept: 'application/json' },
		});
	} catch (error) {
		// fetch() rejects with a TypeError for network failures such as DNS or connection errors
		if (error instanceof TypeError) {
			const cause = error.cause as FetchCause | undefined;
			throw new PageError(`Request to ${url} failed: ${cause?.code ?? cause?.message ?? error.message}`, 'request');
		}
		throw error;
	}
};

const readJson = async (response: Response, url: string, signal: AbortSignal) => {
	if (!response.ok) {
		throw response.status === 404
			? new PageError(`Not a supported status page: ${url} returned HTTP 404`)
			: new PageError(`HTTP ${response.status} from ${url}`, 'request');
	}

	try {
		return await response.json() as unknown;
	} catch (error) {
		if (signal.aborted) {
			throw error;
		}
		throw new PageError(`Not a supported status page: ${url} did not return JSON`);
	}
};

const fetchJson = async (url: string, signal: AbortSignal) => readJson(
	await request(url, signal),
	url,
	signal,
);

export const fetchSummary = async (pageUrl: string, signal: AbortSignal) => {
	const url = `${pageUrl}/api/v2/summary.json`;
	const summary = await fetchJson(url, signal) as Partial<ApiSummary>;
	if (typeof summary.status?.indicator !== 'string' || !Array.isArray(summary.components)) {
		throw new PageError(`Not a supported status page: ${url} is not a Statuspage summary`);
	}
	return summary as ApiSummary;
};

/** Recent incidents, newest first. Statuspage returns 50 and incident.io returns 25. */
export const fetchIncidents = async (pageUrl: string, signal: AbortSignal) => {
	const url = `${pageUrl}/api/v2/incidents.json`;
	const { incidents } = await fetchJson(url, signal) as { incidents?: ApiIncident[] };
	if (!Array.isArray(incidents)) {
		throw new PageError(`Not a supported status page: ${url} has no incidents list`);
	}
	return incidents;
};

/** Looks up a single incident. Supported by Statuspage, not incident.io. */
export const fetchIncident = async (pageUrl: string, id: string, signal: AbortSignal) => {
	const url = `${pageUrl}/api/v2/incidents/${encodeURIComponent(id)}.json`;
	const response = await request(url, signal);

	// A missing incident is reported by the caller. incident.io pages also return 404 here.
	if (response.status === 404) {
		return;
	}
	const { incident } = await readJson(response, url, signal) as { incident?: ApiIncident };
	return incident;
};

// incident.io incident IDs are ULIDs: 26 characters of Crockford base32
const isIncidentIoId = (id: string) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id);

/**
 * Looks up one incident on a Statuspage or incident.io page, in one request when the ID shows the
 * platform. incident.io pages have no single-incident endpoint, and their 404 is a large HTML
 * page, so incident.io IDs are found in the incident list. Other IDs use the Statuspage endpoint
 * and fall back to the list when it returns 404.
 */
export const fetchIncidentById = async (pageUrl: string, id: string, signal: AbortSignal) => {
	const incident = isIncidentIoId(id) ? undefined : await fetchIncident(pageUrl, id, signal);
	if (incident) {
		return incident;
	}
	const incidents = await fetchIncidents(pageUrl, signal);
	return incidents.find(item => item.id === id);
};
