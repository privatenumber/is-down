import type { ComponentStatus } from './component-status.ts';

export type ApiComponent = {
	id: string;
	name: string;
	status: ComponentStatus;
	group?: boolean;
	group_id?: string | null;
};

export type ApiIncidentUpdate = {
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
	components?: { id: string }[];
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

/** An expected failure of a status page, reported as a result instead of thrown */
export class PageError extends Error {}

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
			throw new PageError(`Request to ${url} failed: ${cause?.code ?? cause?.message ?? error.message}`);
		}
		throw error;
	}
};

const readJson = async (response: Response, url: string, signal: AbortSignal) => {
	if (!response.ok) {
		throw new PageError(
			response.status === 404
				? `Not a supported status page: ${url} returned HTTP 404`
				: `HTTP ${response.status} from ${url}`,
		);
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
