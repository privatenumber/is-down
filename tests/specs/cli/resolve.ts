import { describe, test, expect } from 'manten';
import { resolveTargets, TargetError } from '../../../src/cli/resolve.ts';
import { providers, defaultProviders, findProvider } from '../../../src/cli/catalog.ts';
import { npm, github } from '../../../src/providers/index.ts';

describe('resolveTargets', () => {
	test('service domains resolve to their catalog entry', () => {
		expect(resolveTargets(['https://registry.npmjs.org/react', 'github.com'])).toStrictEqual([
			{
				url: 'https://status.npmjs.org',
				provider: npm,
				selectors: undefined,
				incidentIds: [],
			},
			{
				url: 'https://www.githubstatus.com',
				provider: github,
				selectors: undefined,
				incidentIds: [],
			},
		]);
	});

	test('targets for the same page are merged', () => {
		expect(resolveTargets(['gh:git', 'github:actions', 'https://www.githubstatus.com/incidents/x1'])).toStrictEqual([{
			url: 'https://www.githubstatus.com',
			provider: github,
			selectors: undefined,
			incidentIds: ['x1'],
		}]);

		expect(resolveTargets(['gh:git', 'https://www.githubstatus.com#actions'])).toStrictEqual([{
			url: 'https://www.githubstatus.com',
			provider: github,
			selectors: ['git', 'actions'],
			incidentIds: [],
		}]);
	});

	test('incident paths on non-status domains are ignored', () => {
		expect(resolveTargets(['https://github.com/incidents/foo'])[0]!.incidentIds).toStrictEqual([]);
	});

	test('defaults expands to the default services', () => {
		expect(resolveTargets(['defaults']).map(page => page.provider?.id)).toStrictEqual([
			'npm', 'github', 'nodejs', 'vercel', 'cloudflare', 'netlify',
		]);
		const pages = resolveTargets(['discord', 'defaults', 'npm:install', 'DEFAULTS']);
		expect(pages.map(page => page.provider)).toStrictEqual([
			findProvider('discord'),
			...defaultProviders,
		]);

		// npm from defaults is unscoped, so the npm:install selector does not narrow it
		expect(pages[1]!.selectors).toBe(undefined);
	});

	test('unknown names throw', () => {
		expect(() => resolveTargets(['nmp'])).toThrow(TargetError);
		expect(() => resolveTargets(['constructor'])).toThrow(TargetError);
	});

	test('domains outside the catalog need a full URL', () => {
		expect(() => resolveTargets(['asd.com'])).toThrow('Unknown service "asd.com"');
		expect(resolveTargets(['https://asd.com'])).toStrictEqual([{
			url: 'https://asd.com',
			provider: undefined,
			selectors: undefined,
			incidentIds: [],
		}]);
	});

	test('malformed percent-encoding in a fragment is an invalid URL', () => {
		expect(() => resolveTargets(['https://status.example.com#%E0'])).toThrow(TargetError);
	});

	test('renamed IDs keep their old names as aliases', () => {
		expect(resolveTargets(['1password'])[0]!.provider?.id).toBe('onepassword');
	});

	test('no ID or alias is a reserved argument', () => {
		// `defaults` is a keyword and `list` is a command
		const reservedNames = new Set(['defaults', 'list']);
		const shadowing = providers
			.flatMap(provider => [provider.id, ...(provider.aliases ?? [])])
			.filter(name => reservedNames.has(name));
		expect(shadowing).toStrictEqual([]);
	});

	test('defaults are checkable', () => {
		expect(defaultProviders.filter(provider => provider.platform === 'other')).toStrictEqual([]);
	});
});
