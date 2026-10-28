import { styleText } from 'node:util';
import type { ServiceResult } from '../status/types.ts';
import { stateSymbols } from './format.ts';
import { createLiveRegion } from './live-region.ts';

const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Fast runs finish before this, so they never flash a loading view */
const startDelay = 100;

const frameInterval = 80;

/**
 * Awaits the checks while showing one line per service that updates as each result arrives.
 * Shows nothing unless the stream is a terminal, and erases the view before returning,
 * so the final output replaces it.
 */
export const trackProgress = async <T extends Pick<ServiceResult, 'state'>>(
	labels: string[],
	checks: Promise<T>[],
	stream: Parameters<typeof createLiveRegion>[0] = process.stderr,
): Promise<T[]> => {
	const region = createLiveRegion(stream);
	if (!region) {
		return await Promise.all(checks);
	}

	const states: (T['state'] | undefined)[] = labels.map(() => undefined);
	let frame = 0;

	const draw = () => {
		region.render(labels.map((label, index) => {
			const state = states[index];
			const { color, text } = state
				? stateSymbols[state]
				: {
					color: 'cyan' as const,
					text: frames[frame]!,
				};
			return `${styleText(color, text, { stream })} ${label}`;
		}));
		frame = (frame + 1) % frames.length;
	};

	let interval: NodeJS.Timeout | undefined;
	const delay = setTimeout(() => {
		draw();
		interval = setInterval(draw, frameInterval);
	}, startDelay);

	try {
		return await Promise.all(checks.map(async (check, index) => {
			const result = await check;
			states[index] = result.state;
			if (interval) {
				draw();
			}
			return result;
		}));
	} finally {
		clearTimeout(delay);
		clearInterval(interval);
		region.clear();
	}
};
