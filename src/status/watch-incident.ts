import { poll } from '../utils/poll.ts';
import type { IncidentEvent, WatchIncidentOptions } from './types.ts';
import {
	type ApiIncident,
	type ApiIncidentUpdate,
	describeFailure,
	fetchIncidentById,
	resolvedStatuses,
} from './statuspage.ts';
import { sortUpdates, toIncident, toIncidentUpdate } from './evaluate.ts';

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

const updatesAfter = (updates: ApiIncidentUpdate[], createdAt: string) => (
	updates.filter(update => update.created_at > createdAt)
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

	/** Returns the incident, or why it could not be read */
	const check = async (): Promise<ApiIncident | string> => {
		const checkSignal = signal
			? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
			: AbortSignal.timeout(timeout);
		try {
			const incident = await fetchIncidentById(pageUrl, incidentId, checkSignal);
			return incident ?? `Incident ${incidentId} not found on ${pageUrl}`;
		} catch (error) {
			// The caller's abort ends the watch. Only failures of this check become events.
			signal?.throwIfAborted();
			return describeFailure(error, pageUrl);
		}
	};

	return (async function* watch() {
		// Undefined until the first successful check
		let seenUntil: string | undefined;

		const checks = poll(check, {
			interval,
			signal,
		});
		for await (const result of checks) {
			if (typeof result === 'string') {
				yield {
					type: 'error',
					error: result,
				};
				continue;
			}

			// Incidents carry their components' names, so no summary is needed
			const componentNames = new Map(
				result.components?.map(component => [component.id, component.name ?? component.id]),
			);
			const incident = toIncident(result, pageUrl, componentNames);
			const updates = sortUpdates(result);
			if (seenUntil === undefined) {
				yield {
					type: 'incident',
					incident,
				};
			} else {
				for (const update of updatesAfter(updates, seenUntil)) {
					yield {
						type: 'update',
						incident,
						update: toIncidentUpdate(result, update),
					};
				}
			}

			seenUntil = updates.at(-1)?.created_at ?? '';
			if (resolvedStatuses.has(result.status)) {
				return;
			}
		}
	})();
};
