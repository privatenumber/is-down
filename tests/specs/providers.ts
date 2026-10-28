import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, test, expect } from 'manten';
import * as providerExports from '../../src/providers/index.ts';

const entries = Object.values(providerExports).map(provider => [provider.id, provider] as const);

describe('providers', () => {
	// IDs are also export names in is-down/providers, so they must be plain identifiers
	test('IDs are lowercase identifiers', () => {
		const invalid = entries.map(([id]) => id).filter(id => !/^[a-z][a-z\d]*$/.test(id));
		expect(invalid).toStrictEqual([]);
	});

	test('generated exports match providers.json', async () => {
		await promisify(execFile)(process.execPath, [
			new URL('../../scripts/generate-providers.ts', import.meta.url).pathname,
			'--check',
		]);
	});

	test('IDs and aliases are unique', () => {
		const names = new Map<string, string>();
		const collisions: string[] = [];
		for (const [id, provider] of entries) {
			for (const name of [id, ...(provider.aliases ?? [])]) {
				const owner = names.get(name);
				if (owner) {
					collisions.push(`${name} (${owner}, ${id})`);
				}
				names.set(name, id);
			}
		}
		expect(collisions).toStrictEqual([]);
	});

	test('each domain belongs to one provider', () => {
		const owners = new Map<string, string>();
		const duplicates: string[] = [];
		for (const [id, provider] of entries) {
			for (const domain of provider.domains) {
				const owner = owners.get(domain);
				if (owner) {
					duplicates.push(`${domain} (${owner}, ${id})`);
				}
				owners.set(domain, id);
			}
		}
		expect(duplicates).toStrictEqual([]);
	});

	test('URLs are valid for their platform', () => {
		const invalid = entries.filter(([, { url, platform }]) => {
			const parsed = new URL(url);
			if (parsed.protocol !== 'https:') {
				return true;
			}
			return platform !== 'other' && url !== parsed.origin;
		}).map(([id]) => id);
		expect(invalid).toStrictEqual([]);
	});

	test('platforms are known', () => {
		const invalid = entries
			.filter(([, { platform }]) => !['statuspage', 'incident.io', 'other'].includes(platform))
			.map(([id]) => id);
		expect(invalid).toStrictEqual([]);
	});

	// Renovate updates these sources, and NOTICE must carry the license of the version in use
	test('NOTICE matches the licenses of the provider sources', async () => {
		const notice = await fs.readFile(new URL('../../NOTICE', import.meta.url), 'utf8');
		const sources = {
			'getsentry/status-page-list': '@sentry/status-page-list',
			'Jaironlanda/isupmap': 'isupmap',
		};
		for (const [repository, packageName] of Object.entries(sources)) {
			const license = await fs.readFile(
				new URL(`../../node_modules/${packageName}/LICENSE`, import.meta.url),
				'utf8',
			);
			const section = notice.split(`https://github.com/${repository}\n`)[1]?.split(/^={10,}$/m)[1];
			expect(section?.trim()).toBe(license.trim());
		}
	});
});
