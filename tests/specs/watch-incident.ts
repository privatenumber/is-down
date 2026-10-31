import { setTimeout as sleep } from 'node:timers/promises';
import { describe, test, expect } from 'manten';
import { watchIncident, type IncidentEvent } from '../../src/index.ts';
import { createStatusPage } from '../utils/status-page.ts';
import {
	incidentPath, incidentState, sequence, investigating, identified, resolved,
} from '../utils/incident-sequence.ts';

const interval = 10;

describe('watchIncident', () => {
	test('yields the incident, then the updates of each check, and finishes when it resolves', async () => {
		const states = [
			incidentState([investigating]),
			incidentState([investigating]),
			incidentState([investigating, identified, resolved]),
		];
		await using page = await createStatusPage(sequence(states));

		const events: IncidentEvent[] = [];
		for await (const event of watchIncident(`${page.url}/incidents/abc`, { interval })) {
			events.push(event);
		}

		const [, identifiedUpdate, resolvedUpdate] = states[2]!.incident.incident_updates;
		expect(events.map(event => event.type)).toStrictEqual(['incident', 'update']);
		expect(events[0]).toStrictEqual({
			type: 'incident',
			incident: {
				id: 'abc',
				name: 'Elevated build errors',
				status: 'investigating',
				impact: 'major',
				url: `${page.url}/incidents/abc`,
				startedAt: states[0]!.incident.started_at,
				resolvedAt: undefined,
				latestUpdate: {
					status: 'investigating',
					body: 'We are investigating.',
					createdAt: states[0]!.incident.incident_updates[0]!.created_at,
				},
				components: [],
			},
		});
		// One check found both updates, so they arrive together, oldest first
		const update = events[1]!;
		expect(update.type === 'update' && [update.incident.status, update.updates]).toStrictEqual([
			'resolved',
			[
				{
					status: 'identified',
					body: 'The cause has been\nidentified.',
					createdAt: identifiedUpdate!.created_at,
				},
				{
					status: 'resolved',
					body: 'This incident has been resolved.',
					createdAt: resolvedUpdate!.created_at,
				},
			],
		]);
	});

	test('orders updates by time across a daylight saving change', async () => {
		// US daylight saving ends at 2026-11-01T02:00-07:00, so local times repeat an hour
		const update = (status: string, createdAt: string) => ({
			status,
			body: status,
			created_at: createdAt,
		});
		const investigatingUpdate = update('investigating', '2026-11-01T01:40:00.000-07:00');
		const state = (status: string, updates: ReturnType<typeof update>[]) => ({
			incident: {
				id: 'abc',
				name: 'Elevated build errors',
				status,
				impact: 'major',
				created_at: investigatingUpdate.created_at,
				resolved_at: null,
				incident_updates: updates,
			},
		});
		await using page = await createStatusPage(sequence([
			state('investigating', [investigatingUpdate]),
			state('resolved', [
				// Newest first, as Statuspage returns them. Both are later than 01:40-07:00.
				update('resolved', '2026-11-01T01:30:00.000-08:00'),
				update('identified', '2026-11-01T01:10:00.000-08:00'),
				investigatingUpdate,
			]),
		]));

		const statuses: string[] = [];
		for await (const event of watchIncident(`${page.url}/incidents/abc`, { interval })) {
			if (event.type === 'update') {
				statuses.push(...event.updates.map(item => item.status));
			}
		}
		expect(statuses).toStrictEqual(['identified', 'resolved']);
	});

	test('failed checks are yielded and the watch continues', async () => {
		await using page = await createStatusPage(sequence([
			500,
			incidentState([investigating]),
			500,
			incidentState([investigating, resolved]),
		]));

		const events: string[] = [];
		for await (const event of watchIncident(`${page.url}/incidents/abc`, { interval })) {
			events.push(event.type === 'error' ? `${event.kind}: ${event.error}` : event.type);
		}
		expect(events).toStrictEqual([
			`request: HTTP 500 from ${page.url}${incidentPath}`,
			'incident',
			`request: HTTP 500 from ${page.url}${incidentPath}`,
			'update',
		]);
	});

	test('a check that times out is yielded as an error', async () => {
		await using page = await createStatusPage({ [incidentPath]: 'hang' });

		// A caller signal that never aborts, so the check's timeout is combined with it
		const watch = watchIncident(`${page.url}/incidents/abc`, {
			interval,
			timeout: 50,
			signal: new AbortController().signal,
		});
		const { value } = await watch.next();
		await watch.return();
		expect(value).toStrictEqual({
			type: 'error',
			kind: 'request',
			error: `Timed out reaching ${page.url}`,
		});
	});

	test('aborting rejects with the signal reason and stops checking', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
		]));

		const controller = new AbortController();
		const reason = new Error('Stop watching');
		const watch = watchIncident(`${page.url}/incidents/abc`, {
			interval: 60_000,
			signal: controller.signal,
		});

		const first = await watch.next();
		expect(first.value?.type).toBe('incident');

		// The watch is waiting for the next check when the signal aborts
		const next = watch.next();
		controller.abort(reason);
		await expect(next).rejects.toBe(reason);
		expect(page.requests).toStrictEqual([incidentPath]);
	});

	test('aborting during a check rejects with the signal reason', async () => {
		await using page = await createStatusPage({ [incidentPath]: 'hang' });

		const controller = new AbortController();
		const reason = new Error('Stop watching');
		const watch = watchIncident(`${page.url}/incidents/abc`, { signal: controller.signal });

		const first = watch.next();
		await sleep(interval * 5);
		controller.abort(reason);
		await expect(first).rejects.toBe(reason);
	});

	test('an already aborted signal rejects before any check', async () => {
		await using page = await createStatusPage({});

		const reason = new Error('Already stopped');
		const watch = watchIncident(`${page.url}/incidents/abc`, { signal: AbortSignal.abort(reason) });
		await expect(watch.next()).rejects.toBe(reason);
		expect(page.requests).toStrictEqual([]);
	});

	test('returning early stops checking', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
		]));

		// Equivalent to breaking out of a for await loop after the first event
		const watch = watchIncident(`${page.url}/incidents/abc`, { interval });
		const first = await watch.next();
		expect(first.value?.type).toBe('incident');
		await watch.return();

		await sleep(interval * 5);
		expect(page.requests).toStrictEqual([incidentPath]);
	});

	test('incident.io IDs are read from the incident list', async () => {
		const id = '01M64BZ539EBV61Y908QHE84C4';
		const { incident } = incidentState([investigating, resolved]);
		await using page = await createStatusPage({
			'/api/v2/incidents.json': {
				incidents: [{
					...incident,
					id,
				}],
			},
		});

		const events: IncidentEvent[] = [];
		for await (const event of watchIncident(`${page.url}/incidents/${id}`, { interval })) {
			events.push(event);
		}
		expect(events.map(event => event.type)).toStrictEqual(['incident']);
		// incident.io pages have no single-incident endpoint, so it is never requested
		expect(page.requests).toStrictEqual(['/api/v2/incidents.json']);
	});

	test('other IDs fall back to the incident list when the incident endpoint returns 404', async () => {
		await using page = await createStatusPage({
			'/api/v2/incidents.json': { incidents: [incidentState([investigating, resolved]).incident] },
		});

		const events: IncidentEvent[] = [];
		for await (const event of watchIncident(`${page.url}/incidents/abc`, { interval })) {
			events.push(event);
		}
		expect(events.map(event => event.type)).toStrictEqual(['incident']);
		expect(page.requests).toStrictEqual([incidentPath, '/api/v2/incidents.json']);
	});

	test('a postmortem ends the watch', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
			incidentState([investigating, ['postmortem', 'A postmortem is available.', 0]]),
		]));

		const statuses: string[] = [];
		for await (const event of watchIncident(`${page.url}/incidents/abc`, { interval })) {
			if (event.type !== 'error') {
				statuses.push(event.incident.status);
			}
		}
		expect(statuses).toStrictEqual(['investigating', 'postmortem']);
	});

	test('an interval that is not positive throws at the call', () => {
		expect(() => watchIncident('https://status.example.com/incidents/abc', { interval: 0 })).toThrow(
			'interval must be a positive number of milliseconds, received 0',
		);
	});

	test('a URL that is not an incident throws at the call', () => {
		expect(() => watchIncident('https://status.example.com')).toThrow('Not an incident URL: https://status.example.com');
	});
});
