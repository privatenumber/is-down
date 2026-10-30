import { setTimeout as sleep } from 'node:timers/promises';
import type { IncidentEvent, WatchIncidentOptions } from './types.ts';
import {
	type ApiIncident,
	PageError,
	fetchIncident,
	fetchIncidents,
} from './statuspage.ts';
import { toIncident, toIncidentUpdate } from './evaluate.ts';

export const resolvedStatuses = new Set(['resolved', 'postmortem']);

const parseIncidentUrl = (url: string) => {
	const parsed = new URL(url);
	const match = parsed.pathname.match(/^(.*?)\/incidents\/([^/]+)\/?$/);
	if (!match) {
		throw new TypeError(`Not an incident URL: ${url}`);
	}
	return {
		pageUrl: `${parsed.origin}${match[1]}`,
		incidentId: decodeURIComponent(match[2]!),
	};
};

const sortedUpdates = (incident: ApiIncident) => (incident.incident_updates ?? []).slice().sort(
	(a, b) => (a.created_at < b.created_at ? -1 : (a.created_at > b.created_at ? 1 : 0)),
);

/**
 * Watches one incident on a Statuspage-compatible page, such as
 * `https://status.npmjs.org/incidents/abc123`.
 *
 * Yields an `incident` event for the first successful check, then an `update` event for each
 * update posted after it. Failed checks are yielded as `error` events and the watch continues.
 * The iterator finishes after the check that finds the incident resolved.
 *
 * Throws only for an invalid or non-incident URL, and rejects with the signal's reason when
 * `options.signal` aborts.
 */
export const watchIncident = (
	url: string,
	{
		interval = 60_000,
		timeout = 10_000,
		signal,
	}: WatchIncidentOptions = {},
): AsyncGenerator<IncidentEvent, void, undefined> => {
	// Validated before the generator starts, so an invalid URL throws at the call
	const { pageUrl, incidentId } = parseIncidentUrl(url);

	// incident.io pages have no single-incident endpoint, so after the first 404 the list is used
	let useIncidentList = false;

	const fetchWatchedIncident = async (requestSignal: AbortSignal) => {
		if (!useIncidentList) {
			const incident = await fetchIncident(pageUrl, incidentId, requestSignal);
			if (incident) {
				return incident;
			}
			useIncidentList = true;
		}

		const incidents = await fetchIncidents(pageUrl, requestSignal);
		const incident = incidents.find(item => item.id === incidentId);
		if (!incident) {
			throw new PageError(`Incident ${incidentId} not found on ${pageUrl}`);
		}
		return incident;
	};

	/** Returns the incident, or why it could not be read */
	const check = async (): Promise<ApiIncident | string> => {
		const timeoutSignal = AbortSignal.timeout(timeout);
		const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
		try {
			return await fetchWatchedIncident(requestSignal);
		} catch (error) {
			// The caller's abort ends the watch. Only failures of this check become events.
			signal?.throwIfAborted();
			if (error instanceof PageError) {
				return error.message;
			}
			if (timeoutSignal.aborted) {
				return `Timed out reaching ${pageUrl}`;
			}
			throw error;
		}
	};

	const wait = async () => {
		try {
			await sleep(interval, undefined, { signal });
		} catch (error) {
			// timers/promises rejects with its own AbortError, so surface the caller's reason
			signal?.throwIfAborted();
			throw error;
		}
	};

	const convert = (incident: ApiIncident) => toIncident(
		incident,
		pageUrl,
		new Map(incident.components?.map(component => [component.id, component.name ?? component.id])),
	);

	return (async function* watch() {
		signal?.throwIfAborted();

		let first = await check();
		while (typeof first === 'string') {
			yield {
				type: 'error',
				error: first,
			};
			await wait();
			first = await check();
		}

		yield {
			type: 'incident',
			incident: convert(first),
		};

		let lastSeen = sortedUpdates(first).at(-1)?.created_at ?? '';
		let latest = first;
		while (!resolvedStatuses.has(latest.status)) {
			await wait();
			const next = await check();
			if (typeof next === 'string') {
				yield {
					type: 'error',
					error: next,
				};
				continue;
			}

			const incident = convert(next);
			const seenUntil = lastSeen;
			for (const update of sortedUpdates(next).filter(item => item.created_at > seenUntil)) {
				lastSeen = update.created_at;
				yield {
					type: 'update',
					incident,
					update: toIncidentUpdate(next, update),
				};
			}
			latest = next;
		}
	})();
};
