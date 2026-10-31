import { describe, test, expect } from 'manten';
import { createStatusPage } from '../../utils/status-page.ts';
import {
	incidentPath, incidentState, sequence, investigating, identified, monitoring, resolved,
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

	test('--until-update prints every update found by the same check', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
			incidentState([investigating, identified, monitoring]),
		]));

		const incidentUrl = `${page.url}/incidents/abc`;
		const { exitCode, stdout } = await run(['watch', incidentUrl, '--until-update'], { env: fastPolling });
		expect(exitCode).toBe(1);
		expect(stdout).toBe([
			header(page.url),
			'  investigating · We are investigating.',
			'  identified · The cause has been identified.',
			'  monitoring · A fix has been deployed.',
			`Still monitoring. To keep watching, run this again in the background: npx is-down watch ${incidentUrl} --until-update`,
			'',
		].join('\n'));
	});

	test('--until-update exits 0 when the update resolves the incident', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
			incidentState([investigating, resolved]),
		]));

		const { exitCode, stdout } = await run(['watch', `${page.url}/incidents/abc`, '--until-update'], { env: fastPolling });
		expect(exitCode).toBe(0);
		expect(stdout).toBe([
			header(page.url),
			'  investigating · We are investigating.',
			'  resolved · This incident has been resolved.',
			'✓ Resolved · lasted 42m',
			'',
		].join('\n'));
	});

	test('--max-wait exits 124 when the incident is still active', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
		]));

		const incidentUrl = `${page.url}/incidents/abc`;
		const result = await run(['watch', incidentUrl, '--max-wait', '2s'], { env: fastPolling });
		expect(result).toStrictEqual({
			exitCode: 124,
			stdout: [
				header(page.url),
				'  investigating · We are investigating.',
				`Still investigating after <1m. To keep watching, run this again in the background: npx is-down watch ${incidentUrl} --max-wait 2s`,
				'',
			].join('\n'),
			stderr: '',
		});
	});

	test('--max-wait exits 124 when no check has succeeded', async () => {
		await using page = await createStatusPage({ [incidentPath]: 503 });

		const incidentUrl = `${page.url}/incidents/abc`;
		const { exitCode, stdout } = await run(['watch', incidentUrl, '--max-wait', '2s'], { env: fastPolling });
		expect(exitCode).toBe(124);
		expect(stdout).toContain(`! Could not check the incident: HTTP 503 from ${page.url}${incidentPath}\n`);
		expect(stdout.trimEnd().split('\n').at(-1)).toBe(`Still unchecked after <1m. To keep watching, run this again in the background: npx is-down watch ${incidentUrl} --max-wait 2s`);
	});

	test('--max-wait 0 is invalid', async () => {
		const result = await run(['watch', 'https://status.example.com/incidents/abc', '--max-wait', '0']);
		expect(result.exitCode).toBe(2);
		expect(result.stdout).toBe('');
		expect(result.stderr).toContain('--max-wait must be longer than 0');
	});

	test('the rerun command quotes arguments the shell would split', async () => {
		await using page = await createStatusPage(sequence([
			incidentState([investigating]),
			incidentState([investigating, identified]),
		]));

		const incidentUrl = `${page.url}/incidents/abc?from=a b`;
		const { stdout } = await run(['watch', incidentUrl, '--until-update'], { env: fastPolling });
		expect(stdout).toContain(`run this again in the background: npx is-down watch '${incidentUrl}' --until-update\n`);
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

	test('a failed request before the first successful check does not stop the watch', async () => {
		await using page = await createStatusPage(sequence([
			503,
			incidentState([investigating, resolved]),
		]));

		const result = await run(['watch', `${page.url}/incidents/abc`], { env: fastPolling });
		expect(result).toStrictEqual({
			exitCode: 0,
			stdout: [
				`! Could not check the incident: HTTP 503 from ${page.url}${incidentPath}`,
				header(page.url),
				'  resolved · This incident has been resolved.',
				'✓ Resolved · lasted 42m',
				'',
			].join('\n'),
			stderr: '',
		});
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
