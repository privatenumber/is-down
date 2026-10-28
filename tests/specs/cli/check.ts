import { describe, test, expect } from 'manten';
import {
	createStatusPage, summary, incident, ago, minutes,
} from '../../utils/status-page.ts';
import { run } from './run.ts';

const summaryPath = '/api/v2/summary.json';
const incidentsPath = '/api/v2/incidents.json';

describe('check', () => {
	describe('current state', () => {
		test('operational page exits 0', async () => {
			await using page = await createStatusPage({
				[summaryPath]: summary({ incidents: [] }),
				[incidentsPath]: { incidents: [] },
			});

			const result = await run([page.url]);
			expect(result).toStrictEqual({
				exitCode: 0,
				stdout: '✓ Example\n',
				stderr: '',
			});
		});

		test('degraded component and active incident exit 1', async () => {
			const active = incident({
				id: 'abc',
				name: 'Elevated build errors',
				status: 'monitoring',
				updates: ['A fix has been implemented.', 'We are investigating.'],
				components: ['builds'],
			});
			await using page = await createStatusPage({
				[summaryPath]: summary({
					indicator: 'minor',
					description: 'Minor Service Outage',
					components: [
						{
							id: 'api',
							name: 'API',
						},
						{
							id: 'builds',
							name: 'Builds',
							status: 'degraded_performance',
						},
					],
					incidents: [active],
				}),
				[incidentsPath]: { incidents: [active] },
			});

			const { exitCode, stdout } = await run([page.url]);
			expect(exitCode).toBe(1);
			expect(stdout).toBe([
				'! Example  Minor Service Outage',
				'    Builds: degraded performance',
				'    ● Elevated build errors [minor] · monitoring · started 30m ago',
				'      A fix has been implemented.',
				'      Affected: Builds',
				`      ${page.url}/incidents/abc`,
				'',
			].join('\n'));
		});

		test('large groups are summarized', async () => {
			await using page = await createStatusPage({
				[summaryPath]: summary({
					indicator: 'major',
					description: 'Partial System Outage',
					components: [
						{
							id: 'asia',
							name: 'Asia',
							group: true,
						},
						...['A', 'B', 'C', 'D'].map(name => ({
							id: name,
							name,
							group_id: 'asia',
							status: name === 'A' ? 'major_outage' : 'degraded_performance',
						})),
						{
							id: 'E',
							name: 'E',
							group_id: 'asia',
						},
					],
					incidents: [],
				}),
				[incidentsPath]: { incidents: [] },
			});

			const { exitCode, stdout } = await run([page.url]);
			expect(exitCode).toBe(1);
			expect(stdout).toContain('    Asia: 4 of 5 affected (worst: major outage)\n');
		});

		test('incident.io pages read incidents from the incident list', async () => {
			await using page = await createStatusPage({
				[summaryPath]: summary({
					components: [{
						id: 'chat',
						name: 'Chat',
					}],
				}),
				[incidentsPath]: {
					incidents: [
						incident({
							id: 'active',
							name: 'Chat is slow',
						}),
						incident({
							id: 'old',
							name: 'Old',
							status: 'resolved',
							resolvedAt: ago(minutes(60 * 24)),
						}),
					],
				},
			});

			const { exitCode, stdout } = await run([page.url, '--since', '0']);
			expect(exitCode).toBe(1);
			expect(stdout).toContain('● Chat is slow [minor] · investigating');
			expect(stdout).not.toContain('Old');
		});

		test('incidents with no impact do not degrade', async () => {
			const notice = incident({
				id: 'n',
				name: 'Scheduled notice',
				impact: 'none',
			});
			await using page = await createStatusPage({
				[summaryPath]: summary({ incidents: [notice] }),
				[incidentsPath]: { incidents: [notice] },
			});

			const { exitCode, stdout } = await run([page.url]);
			expect(exitCode).toBe(0);
			expect(stdout).toContain('● Scheduled notice · investigating');
		});
	});

	describe('component scope', () => {
		const components = [
			{
				id: 'api',
				name: 'API Requests',
				status: 'major_outage',
			},
			{
				id: 'builds',
				name: 'Build Pipeline',
			},
			{
				id: 'deploys',
				name: 'Deploys',
				status: 'under_maintenance',
			},
		];

		test('ignores components outside the scope', async () => {
			const apiIncident = incident({
				id: 'api-down',
				name: 'API down',
				components: ['api'],
			});
			await using page = await createStatusPage({
				[summaryPath]: summary({
					indicator: 'major',
					components,
					incidents: [apiIncident],
				}),
				[incidentsPath]: { incidents: [apiIncident] },
			});

			const { exitCode, stdout } = await run([`${page.url}#build`]);
			expect(exitCode).toBe(0);
			expect(stdout).toBe('✓ Example › Build Pipeline\n');
		});

		test('incidents without components affect every scope', async () => {
			const unlinked = incident({
				id: 'unlinked',
				name: 'Something is wrong',
			});
			await using page = await createStatusPage({
				[summaryPath]: summary({
					components,
					incidents: [unlinked],
				}),
				[incidentsPath]: { incidents: [unlinked] },
			});

			const { exitCode, stdout } = await run([`${page.url}#build`]);
			expect(exitCode).toBe(1);
			expect(stdout).toContain('! Example › Build Pipeline  Active Incident');
		});

		test('maintenance on a scoped component degrades', async () => {
			await using page = await createStatusPage({
				[summaryPath]: summary({
					components,
					incidents: [],
				}),
				[incidentsPath]: { incidents: [] },
			});

			const { exitCode, stdout } = await run([`${page.url}#deploys`]);
			expect(exitCode).toBe(1);
			expect(stdout).toContain('! Example › Deploys  Under Maintenance');
		});

		test('unknown component lists available components', async () => {
			await using page = await createStatusPage({
				[summaryPath]: summary({
					components,
					incidents: [],
				}),
				[incidentsPath]: { incidents: [] },
			});

			const { exitCode, stdout } = await run([`${page.url}#nope`]);
			expect(exitCode).toBe(2);
			expect(stdout).toContain('No component matches "nope". Components: API Requests, Build Pipeline, Deploys');
		});
	});

	describe('recent incidents', () => {
		const resolved = (id: string, resolvedMinutesAgo: number) => incident({
			id,
			name: `Resolved ${id}`,
			status: 'resolved',
			startedAt: ago(minutes(resolvedMinutesAgo + 90)),
			resolvedAt: ago(minutes(resolvedMinutesAgo)),
		});

		test('shows incidents resolved within the window without failing', async () => {
			await using page = await createStatusPage({
				[summaryPath]: summary({ incidents: [] }),
				[incidentsPath]: { incidents: [resolved('recent', 20), resolved('old', 180)] },
			});

			const { exitCode, stdout } = await run([page.url]);
			expect(exitCode).toBe(0);
			expect(stdout).toContain('Resolved 20m ago: Resolved recent [minor] · lasted 1h30m');
			expect(stdout).not.toContain('Resolved old');

			const wider = await run([page.url, '--since', '4h']);
			expect(wider.stdout).toContain('Resolved 3h ago: Resolved old');
		});

		test('--since 0 skips the incident list', async () => {
			await using page = await createStatusPage({
				[summaryPath]: summary({ incidents: [] }),
			});

			const { exitCode } = await run([page.url, '--since', '0']);
			expect(exitCode).toBe(0);
			expect(page.requests).toStrictEqual([summaryPath]);
		});

		test('incident URL shows that incident regardless of age', async () => {
			await using page = await createStatusPage({
				[summaryPath]: summary({ incidents: [] }),
				[incidentsPath]: { incidents: [] },
				'/api/v2/incidents/archived.json': { incident: resolved('archived', 60 * 24 * 10) },
			});

			const { exitCode, stdout } = await run([`${page.url}/incidents/archived`]);
			expect(exitCode).toBe(0);
			expect(stdout).toContain('Resolved 10d ago: Resolved archived');
		});

		test('failed incident lookups report the failure', async () => {
			await using page = await createStatusPage({
				[summaryPath]: summary({ incidents: [] }),
				[incidentsPath]: { incidents: [] },
				'/api/v2/incidents/broken.json': 500,
			});

			const { exitCode, stdout } = await run([`${page.url}/incidents/broken`]);
			expect(exitCode).toBe(2);
			expect(stdout).toContain(`HTTP 500 from ${page.url}/api/v2/incidents/broken.json`);

			const missing = await run([`${page.url}/incidents/missing`]);
			expect(missing.stdout).toContain('Incident missing not found');
		});
	});

	describe('errors', () => {
		test('server error exits 2', async () => {
			await using page = await createStatusPage({ [summaryPath]: 500 });

			const { exitCode, stdout } = await run([page.url]);
			expect(exitCode).toBe(2);
			expect(stdout).toBe(`✗ 127.0.0.1  HTTP 500 from ${page.url}${summaryPath}\n`);
		});

		test('non-Statuspage JSON exits 2', async () => {
			await using page = await createStatusPage({ [summaryPath]: { hello: 'world' } });

			const { exitCode, stdout } = await run([page.url]);
			expect(exitCode).toBe(2);
			expect(stdout).toContain('Not a supported status page');
		});

		test('timeout exits 2', async () => {
			await using page = await createStatusPage({ [summaryPath]: 'hang' });

			const { exitCode, stdout } = await run([page.url, '--timeout', '200', '--since', '0']);
			expect(exitCode).toBe(2);
			expect(stdout).toBe(`✗ 127.0.0.1  Timed out reaching ${page.url}\n`);
		});

		test('degraded takes precedence over unreachable', async () => {
			await using degradedPage = await createStatusPage({
				[summaryPath]: summary({
					indicator: 'minor',
					incidents: [],
				}),
				[incidentsPath]: { incidents: [] },
			});
			await using brokenPage = await createStatusPage({ [summaryPath]: 500 });

			const { exitCode } = await run([degradedPage.url, brokenPage.url]);
			expect(exitCode).toBe(1);
		});

		test('unknown service suggests catalog IDs', async () => {
			const result = await run(['gthub']);
			expect(result).toStrictEqual({
				exitCode: 2,
				stdout: '',
				stderr: [
					'Error: Unknown service "gthub"',
					'',
					'Did you mean: github?',
					'Run "is-down list" to see known services.',
					'To check a status page outside the catalog, pass its full URL, such as https://status.example.com',
					'',
				].join('\n'),
			});
		});

		test('invalid flag value exits 2', async () => {
			const { exitCode, stderr } = await run(['--since', '5x']);
			expect(exitCode).toBe(2);
			expect(stderr).toContain('Invalid duration "5x"');
		});
	});

	test('--json', async () => {
		const active = incident({
			id: 'abc',
			name: 'Broken',
			components: ['api'],
		});
		await using page = await createStatusPage({
			[summaryPath]: summary({
				indicator: 'minor',
				description: 'Minor Service Outage',
				components: [{
					id: 'api',
					name: 'API',
					status: 'partial_outage',
				}],
				incidents: [active],
			}),
			[incidentsPath]: { incidents: [active] },
		});

		const { exitCode, stdout } = await run([page.url, '--json']);
		expect(exitCode).toBe(1);
		expect(JSON.parse(stdout)).toStrictEqual([{
			name: 'Example',
			url: page.url,
			state: 'degraded',
			description: 'Minor Service Outage',
			components: [{
				name: 'API',
				status: 'partial_outage',
			}],
			incidents: [{
				id: 'abc',
				name: 'Broken',
				status: 'investigating',
				impact: 'minor',
				url: `${page.url}/incidents/abc`,
				startedAt: active.started_at,
				latestUpdate: {
					body: 'We are currently investigating this issue.',
					createdAt: active.incident_updates[0]!.created_at,
				},
				components: ['API'],
			}],
			recentIncidents: [],
			requestedIncidents: [],
		}]);
	});

	test('catalog entries without a status API point to the page', async () => {
		const result = await run(['aws']);
		expect(result).toStrictEqual({
			exitCode: 2,
			stdout: '✗ AWS  AWS has no status API that is-down can read. Check https://health.aws.amazon.com/health/status\n',
			stderr: '',
		});
	});
});
