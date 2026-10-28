import { describe, test, expect } from 'manten';
import providersJson from '../../../src/providers/providers.json' with { type: 'json' };
import { run } from './run.ts';

describe('list', () => {
	test('filters by word prefix and lists aliases', async () => {
		const { exitCode, stdout } = await run(['list', 'githu']);
		expect(exitCode).toBe(0);
		expect(stdout).toBe([
			'SERVICE     STATUS PAGE',
			'github, gh  www.githubstatus.com',
			'',
			`1 of ${Object.keys(providersJson).length} services match "githu". Check one with: is-down <service>`,
			'',
		].join('\n'));
	});

	test('matches domains', async () => {
		const { stdout } = await run(['list', 'registry.npmjs.org']);
		expect(stdout).toContain('\nnpm      status.npmjs.org\n');
	});

	test('marks pages that cannot be checked', async () => {
		const { stdout } = await run(['list', 'appledeveloper']);
		expect(stdout).toContain('\nappledeveloper  developer.apple.com/system-status  (not checkable)\n');
	});

	test('--json matches the providers export', async () => {
		const { exitCode, stdout } = await run(['list', '--json']);
		expect(exitCode).toBe(0);
		expect(JSON.parse(stdout)).toStrictEqual(providersJson);
	});

	test('--json with no match prints an empty object and exits 2', async () => {
		const { exitCode, stdout } = await run(['list', 'zzzz', '--json']);
		expect(exitCode).toBe(2);
		expect(JSON.parse(stdout)).toStrictEqual({});
	});

	test('no match exits 2', async () => {
		const result = await run(['list', 'zzzz']);
		expect(result).toStrictEqual({
			exitCode: 2,
			stdout: '',
			stderr: 'No services match "zzzz"\n',
		});
	});
});
