import { setTimeout as sleep } from 'node:timers/promises';
import { describe, test, expect } from 'manten';
import { watchIncident, type IncidentEvent } from '../../src/index.ts';
import { createStatusPage } from '../utils/status-page.ts';
import {
	incidentPath, incidentState, sequence, investigating, identified, resolved,
} from '../utils/incident-sequence.ts';

const interval = 10;

describe('watchIncident', () => {
	test('yields the incident, then each update, and finishes when it resolves', async () => {
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
		expect(events.map(event => (event.type === 'error' ? event : [event.type, event.incident.status]))).toStrictEqual([
			['incident', 'investigating'],
			['update', 'resolved'],
			['update', 'resolved'],
		]);
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
		expect(events.slice(1).map(event => event.type === 'update' && event.update)).toStrictEqual([
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
		]);
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
			events.push(event.type === 'error' ? event.error : event.type);
		}
		expect(events).toStrictEqual([
			`HTTP 500 from ${page.url}${incidentPath}`,
			'incident',
			`HTTP 500 from ${page.url}${incidentPath}`,
			'update',
		]);
	});

	test('a check that times out is yielded as an error', async () => {
		await using page = await createStatusPage({ [incidentPath]: 'hang' });

		const watch = watchIncident(`${page.url}/incidents/abc`, {
			interval,
			timeout: 50,
		});
		const { value } = await watch.next();
		await watch.return();
		expect(value).toStrictEqual({
			type: 'error',
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

	test('a URL that is not an incident throws at the call', () => {
		expect(() => watchIncident('https://status.example.com')).toThrow('Not an incident URL: https://status.example.com');
	});
});
