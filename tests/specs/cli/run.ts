import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cliPath = fileURLToPath(new URL('../../../src/cli/index.ts', import.meta.url));

const { FORCE_COLOR: _, ...environment } = process.env;

export const run = (
	args: string[],
	options?: {
		cwd?: string;
		env?: Record<string, string>;
	},
) => new Promise<{
	exitCode: number;
	stdout: string;
	stderr: string;
}>((resolve) => {
	execFile(
		process.execPath,
		[cliPath, ...args],
		{
			cwd: options?.cwd,
			env: {
				...environment,
				NO_COLOR: '1',
				...options?.env,
			},
		},
		(error, stdout, stderr) => {
			resolve({
				exitCode: error ? Number(error.code) : 0,
				stdout,
				stderr,
			});
		},
	);
});
