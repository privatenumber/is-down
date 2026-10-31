import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Calls `check` immediately and then every `interval` milliseconds, yielding each result.
 * Stops when the consumer stops iterating. When `signal` aborts, during a check or between
 * checks, iteration rejects with the signal's reason.
 */
export async function* poll<T>(
	check: () => Promise<T>,
	{
		interval,
		signal,
	}: {
		interval: number;
		signal?: AbortSignal;
	},
): AsyncGenerator<T, never, undefined> {
	while (true) {
		signal?.throwIfAborted();
		yield await check();
		try {
			await sleep(interval, undefined, { signal });
		} catch (error) {
			// timers/promises rejects with its own AbortError, so surface the caller's reason
			signal?.throwIfAborted();
			throw error;
		}
	}
}
