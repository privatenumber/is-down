import { describe, test, expect } from 'manten';
import { createLiveRegion } from '../../../src/cli/live-region.ts';
import { createFakeTerminal } from './fake-terminal.ts';

const begin = '\u001B[?2026h';
const end = '\u001B[?2026l';
const hide = '\u001B[?25l\u001B[?7l';
const restore = '\u001B[?25h\u001B[?7h';

describe('live region', () => {
	test('each frame is one synchronized write that replaces the previous one', () => {
		const terminal = createFakeTerminal();
		const region = createLiveRegion(terminal)!;

		region.render(['a', 'b']);
		region.render(['c']);
		region.clear();

		expect(terminal.writes).toStrictEqual([
			`${begin}${hide}a\nb\n${end}`,
			`${begin}${hide}\u001B[2A\u001B[0Jc\n${end}`,
			`\u001B[1A\u001B[0J${restore}`,
		]);
	});

	test('clearing before rendering writes nothing', () => {
		const terminal = createFakeTerminal();
		createLiveRegion(terminal)!.clear();
		expect(terminal.writes).toStrictEqual([]);
	});

	test('non-terminal streams get no region', () => {
		expect(createLiveRegion(createFakeTerminal(false))).toBe(undefined);
	});
});
