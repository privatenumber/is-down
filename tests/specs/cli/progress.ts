import { setTimeout } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { describe, test, expect } from 'manten';
import { trackProgress } from '../../../src/cli/progress.ts';
import { createFakeTerminal } from './fake-terminal.ts';

const result = (state: 'operational' | 'degraded') => ({ state });

describe('progress', () => {
	test('draws a line per check and erases it when done', async () => {
		const stream = createFakeTerminal();
		const results = await trackProgress(
			['npm', 'GitHub'],
			[
				Promise.resolve(result('operational')),
				setTimeout(300).then(() => result('degraded')),
			],
			stream,
		);

		expect(results).toStrictEqual([result('operational'), result('degraded')]);

		const output = stripVTControlCharacters(stream.writes.join(''));
		expect(output).toContain('✓ npm\n');
		expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] GitHub\n/);
		expect(output).toContain('! GitHub\n');

		// The view is erased and the cursor restored last, so the final output replaces it
		expect(stream.writes.at(-1)).toBe('\u001B[2A\u001B[0J\u001B[?25h\u001B[?7h');
	});

	test('fast checks never draw', async () => {
		const stream = createFakeTerminal();
		await trackProgress(['npm'], [Promise.resolve(result('operational'))], stream);
		expect(stream.writes).toStrictEqual([]);
	});

	test('non-interactive output never draws', async () => {
		const stream = createFakeTerminal(false);
		await trackProgress(['npm'], [setTimeout(200).then(() => result('operational'))], stream);
		expect(stream.writes).toStrictEqual([]);
	});
});
