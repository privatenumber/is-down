import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test, expect } from 'manten';
import { run } from './run.ts';

const skillUrl = new URL('../../../skills/is-down/SKILL.md', import.meta.url);

const withTemporaryDirectory = async (callback: (directory: string) => Promise<void>) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'is-down-skills-'));
	try {
		await callback(directory);
	} finally {
		await fs.rm(directory, {
			recursive: true,
			force: true,
		});
	}
};

describe('skills', () => {
	test('prints the bundled skill', async () => {
		const result = await run(['skills']);
		expect(result).toStrictEqual({
			exitCode: 0,
			stdout: await fs.readFile(skillUrl, 'utf8'),
			stderr: '',
		});
	});

	test('--install copies the skill into <directory>/is-down and creates missing directories', async () => {
		await withTemporaryDirectory(async (directory) => {
			const result = await run(['skills', '--install', '.agents/skills/'], { cwd: directory });
			const destination = path.join(await fs.realpath(directory), '.agents', 'skills', 'is-down');
			expect(result).toStrictEqual({
				exitCode: 0,
				stdout: '',
				stderr: `Installed the is-down skill to ${destination}\n`,
			});
			expect(await fs.readFile(path.join(destination, 'SKILL.md'), 'utf8')).toBe(await fs.readFile(skillUrl, 'utf8'));
		});
	});

	test('--install overwrites an earlier copy', async () => {
		await withTemporaryDirectory(async (directory) => {
			const skillPath = path.join(directory, 'is-down', 'SKILL.md');
			await fs.mkdir(path.dirname(skillPath));
			await fs.writeFile(skillPath, 'outdated');

			const { exitCode } = await run(['skills', '--install', directory]);
			expect(exitCode).toBe(0);
			expect(await fs.readFile(skillPath, 'utf8')).toBe(await fs.readFile(skillUrl, 'utf8'));
		});
	});

	test('--install= expands a leading ~ to the home directory', async () => {
		await withTemporaryDirectory(async (directory) => {
			const { exitCode } = await run(['skills', '--install=~/.claude/skills'], {
				env: {
					HOME: directory,
					USERPROFILE: directory,
				},
			});
			expect(exitCode).toBe(0);
			await fs.access(path.join(directory, '.claude', 'skills', 'is-down', 'SKILL.md'));
		});
	});
});
