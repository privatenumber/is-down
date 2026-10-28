import { describe, test, expect } from 'manten';
import { getStatus } from '../../src/index.ts';
import type { Provider } from '../../src/providers/index.ts';
import { createStatusPage, summary, incident } from '../utils/status-page.ts';

const summaryPath = '/api/v2/summary.json';
const incidentsPath = '/api/v2/incidents.json';

describe('getStatus', () => {
	test('accepts a provider and scopes to components', async () => {
		const broken = incident({
			id: 'pub',
			name: 'Publishing is broken',
			components: ['publish'],
		});
		await using page = await createStatusPage({
			[summaryPath]: summary({
				indicator: 'minor',
				components: [
					{
						id: 'install',
						name: 'Package installation',
					},
					{
						id: 'publish',
						name: 'Package publishing',
						status: 'major_outage',
					},
				],
				incidents: [broken],
			}),
			[incidentsPath]: { incidents: [broken] },
		});
		const provider: Provider = {
			id: 'example',
			name: 'Example Registry',
			url: page.url,
			platform: 'statuspage',
			domains: [],
		};

		const scoped = await getStatus(provider, { components: ['install'] });
		expect(scoped).toMatchObject({
			id: 'example',
			name: 'Example Registry',
			state: 'operational',
			scope: ['install'],
		});

		const whole = await getStatus(provider);
		expect(whole.state).toBe('degraded');
	});

	test('Object.prototype names are not component aliases', async () => {
		await using page = await createStatusPage({
			[summaryPath]: summary({
				components: [
					{
						id: 'pr',
						name: 'Pull Requests',
					},
				],
				incidents: [],
			}),
		});
		const provider: Provider = {
			id: 'example',
			name: 'Example',
			url: page.url,
			platform: 'statuspage',
			domains: [],
			components: { pr: 'Pull Requests' },
		};

		const result = await getStatus(provider, {
			components: ['constructor', '__proto__'],
			since: 0,
		});
		expect(result).toMatchObject({
			state: 'error',
			error: 'No component matches "constructor". Components: Pull Requests',
		});
	});

	test('accepts a status page URL', async () => {
		await using page = await createStatusPage({
			[summaryPath]: summary({ incidents: [] }),
			[incidentsPath]: { incidents: [] },
		});

		const result = await getStatus(`${page.url}/some/path`);
		expect(result).toMatchObject({
			name: 'Example',
			url: page.url,
			state: 'operational',
		});
	});

	test('providers without a status API return an error', async () => {
		const result = await getStatus({
			id: 'example',
			name: 'Example',
			url: 'https://status.example.com',
			platform: 'other',
			domains: [],
		});
		expect(result).toMatchObject({
			state: 'error',
			error: 'Example has no status API that is-down can read. Check https://status.example.com',
		});
	});

	test('timeouts return an error', async () => {
		await using page = await createStatusPage({ [summaryPath]: 'hang' });

		const result = await getStatus(page.url, {
			signal: AbortSignal.timeout(100),
			since: 0,
		});
		expect(result).toMatchObject({
			state: 'error',
			error: `Timed out reaching ${page.url}`,
		});
	});

	test('aborting rejects with the signal reason', async () => {
		await using page = await createStatusPage({ [summaryPath]: 'hang' });
		const controller = new AbortController();
		const reason = new Error('Cancelled');

		const pending = getStatus(page.url, {
			signal: controller.signal,
			since: 0,
		});
		controller.abort(reason);
		await expect(pending).rejects.toBe(reason);
	});
});
