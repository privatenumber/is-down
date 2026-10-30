import { describe, test, expect } from 'manten';
import { createStatusPage, ago, minutes } from '../../utils/status-page.ts';
import { run } from './run.ts';

const incidentPath = '/api/v2/incidents/abc.json';

const fastPolling = { IS_DOWN_WATCH_INTERVAL: '20' };

type Update = [status: string, body: string, minutesAgo: number];

const incidentState = (updates: Update[]) => {
	const [status] = updates.at(-1)!;
	const resolved = status === 'resolved';
	return {
		incident: {
			id: 'abc',
			name: 'Elevated build errors',
			status,
			impact: 'major',
			created_at: ago(minutes(42)),
			started_at: ago(minutes(42)),
			resolved_at: resolved ? ago(minutes(updates.at(-1)![2])) : null,
			incident_updates: updates.map(([updateStatus, body, minutesAgo]) => ({
				status: updateStatus,
				body,
				created_at: ago(minutes(minutesAgo)),
			})),
		},
	};
};

/** Serves each state once in order, then keeps serving the last one */
const sequence = (states: (object | number)[]) => {
	let index = 0;
	return {
		get [incidentPath]() {
			const state = states[Math.min(index, states.length - 1)]!;
			index += 1;
			return state;
		},
	};
};

const investigating: Update = ['investigating', 'We are investigating.', 40];
const identified: Update = ['identified', 'The cause has been\nidentified.', 20];
const resolved: Update = ['resolved', 'This incident has been resolved.', 0];

const header = (url: string) => `● Elevated build errors [major] · started 42m ago · ${url}/incidents/abc`;

describe('watch', () => {
	test('prints each update and exits 0 when the incident resolves', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
			incidentState([investigating]),
			incidentState([investigating, identified]),
			incidentState([investigating, identified, resolved]),
		]));

		const result = await run(['watch', `${page.url}/incidents/abc`], { env: fastPolling });
		expect(result).toStrictEqual({
			exitCode: 0,
			stdout: [
				header(page.url),
				'  investigating · We are investigating.',
				'  identified · The cause has been identified.',
				'  resolved · This incident has been resolved.',
				'✓ Resolved · lasted 42m',
				'',
			].join('\n'),
			stderr: '',
		});
	});

	test('already resolved exits 0 after the first check', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating, resolved]),
		]));

		const result = await run(['watch', `${page.url}/incidents/abc`], { env: fastPolling });
		expect(result).toStrictEqual({
			exitCode: 0,
			stdout: [
				header(page.url),
				'  resolved · This incident has been resolved.',
				'✓ Resolved · lasted 42m',
				'',
			].join('\n'),
			stderr: '',
		});
		expect(page.requests).toStrictEqual([incidentPath]);
	});

	test('--until-update exits 1 at the next update with the command to rerun', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
			incidentState([investigating]),
			incidentState([investigating, identified]),
		]));

		const incidentUrl = `${page.url}/incidents/abc`;
		const result = await run(['watch', incidentUrl, '--until-update'], { env: fastPolling });
		expect(result).toStrictEqual({
			exitCode: 1,
			stdout: [
				header(page.url),
				'  investigating · We are investigating.',
				'  identified · The cause has been identified.',
				`Still identified. To keep watching, run this again in the background: npx is-down watch ${incidentUrl} --until-update`,
				'',
			].join('\n'),
			stderr: '',
		});
	});

	test('--max-wait exits 124 when the incident is still active', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
		]));

		const incidentUrl = `${page.url}/incidents/abc`;
		const result = await run(['watch', incidentUrl, '--max-wait', '1s'], { env: fastPolling });
		expect(result).toStrictEqual({
			exitCode: 124,
			stdout: [
				header(page.url),
				'  investigating · We are investigating.',
				`Still investigating after <1m. To keep watching, run: npx is-down watch ${incidentUrl} --max-wait 1s`,
				'',
			].join('\n'),
			stderr: '',
		});
	});

	test('a failed check is reported and watching continues', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
			500,
			incidentState([investigating, resolved]),
		]));

		const { exitCode, stdout } = await run(['watch', `${page.url}/incidents/abc`], { env: fastPolling });
		expect(exitCode).toBe(0);
		expect(stdout).toContain(`! Could not check the incident: HTTP 500 from ${page.url}${incidentPath}\n`);
		expect(stdout).toContain('✓ Resolved');
	});

	test('pages without a single-incident endpoint use the incident list', async () => {
		await using page = await createStatusPage({
			'/api/v2/incidents.json': { incidents: [incidentState([investigating, resolved]).incident] },
		});

		const { exitCode, stdout } = await run(['watch', `${page.url}/incidents/abc`], { env: fastPolling });
		expect(exitCode).toBe(0);
		expect(stdout).toContain('✓ Resolved');
	});

	test('a missing incident exits 2', async () => {
		await using page = await createStatusPage({
			'/api/v2/incidents.json': { incidents: [] },
		});

		const result = await run(['watch', `${page.url}/incidents/abc`], { env: fastPolling });
		expect(result).toStrictEqual({
			exitCode: 2,
			stdout: '',
			stderr: `Error: Incident abc not found on ${page.url}\n`,
		});
	});

	test('a service without an incident exits 2', async () => {
		const result = await run(['watch', 'npm']);
		expect(result.exitCode).toBe(2);
		expect(result.stdout).toBe('');
		expect(result.stderr).toContain('Error: "npm" is not an incident URL');
	});
});
