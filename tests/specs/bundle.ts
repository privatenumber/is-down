import { fileURLToPath } from 'node:url';
import { describe, test, expect } from 'manten';
import { build } from 'esbuild';

const srcDirectory = fileURLToPath(new URL('../../src', import.meta.url));

const bundle = async (code: string) => {
	const result = await build({
		stdin: {
			contents: code,
			resolveDir: srcDirectory,
			loader: 'ts',
		},
		bundle: true,
		format: 'esm',
		platform: 'node',
		write: false,
	});
	return result.outputFiles[0]!.text;
};

describe('tree-shaking', () => {
	test('importing one provider bundles only that provider', async () => {
		const output = await bundle(`
			import { npm } from './providers/index.ts';
			console.log(npm);
		`);
		expect(output).toContain('https://status.npmjs.org');
		expect(output).not.toContain('https://www.githubstatus.com');
	});

	test('the main entry does not include the catalog', async () => {
		const output = await bundle(`
			import { getStatus } from './index.ts';
			console.log(getStatus);
		`);
		expect(output).not.toContain('https://status.npmjs.org');
	});
});
