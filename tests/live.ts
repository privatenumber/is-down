import { describe, test, expect } from 'manten';
import { getStatus } from '../src/status/get-status.ts';
import * as providers from '../src/providers/index.ts';

// Checks every catalog entry against its real status page.
// Not part of `pnpm test` because it depends on the network.
describe('live catalog', () => {
	for (const provider of Object.values(providers)) {
		test(provider.id, async () => {
			if (provider.platform === 'other') {
				const response = await fetch(provider.url, { signal: AbortSignal.timeout(10_000) });

				// Some pages reject non-browser clients, which still proves the page exists
				expect(response.status).toBeLessThan(500);
				return;
			}

			const response = await fetch(`${provider.url}/api/v2/summary.json`, { signal: AbortSignal.timeout(10_000) });
			const summary = await response.json() as { components: { name: string }[] };
			const componentNames = new Set(summary.components.map(component => component.name));
			const configuredNames = [
				...Object.values(provider.components ?? {}),
				...(provider.ignoreComponents ?? []),
			];
			for (const name of configuredNames) {
				expect(componentNames.has(name)).toBe(true);
			}

			const result = await getStatus(provider, {
				signal: AbortSignal.timeout(10_000),
				since: 7 * 24 * 60 * 60 * 1000,
			});
			expect(result.state).not.toBe('error');
		}, { retry: 2 });
	}
}, { parallel: 20 });
