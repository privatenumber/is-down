import { describe, test, expect } from 'manten';
import { createStatusPage } from '../../utils/status-page.ts';
import {
	incidentPath, incidentState, sequence, investigating, identified, resolved,
} from '../../utils/incident-sequence.ts';
import { run } from './run.ts';

const fastPolling = { IS_DOWN_WATCH_INTERVAL: '20' };

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
