/**
 * Finds status pages in third-party indexes that are not in the catalog yet.
 *
 * Each candidate page is checked live, and its platform is detected from the API response.
 * With --write, new candidates are added to src/providers/providers.json.
 * Existing entries are never changed.
 */
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { cli } from 'cleye';
import type { Provider } from 'is-down/providers';
import { loadCandidates, type Candidate } from './sources.ts';
import { detect, type Detection } from './detect.ts';
import { cleanName, slugify, normalizeDomains } from './names.ts';

// Entries in providers.json are keyed by ID
type ProviderData = Omit<Provider, 'id'>;

// The catalog source file this script updates
const providersPath = new URL('../../src/providers/providers.json', import.meta.url);

const argv = cli({
	name: 'import-providers',
	flags: {
		write: {
			type: Boolean,
			description: 'Add new candidates to src/providers/providers.json',
		},
	},
});

const existing = JSON.parse(await fs.readFile(providersPath, 'utf8')) as Record<string, ProviderData>;
const existingHosts = new Set(
	Object.values(existing).map(provider => new URL(provider.url).hostname),
);
const claimedDomains = new Set(Object.values(existing).flatMap(provider => provider.domains));

// Merged by status page host. Earlier sources are more reliable and win conflicts.
const byHost = new Map<string, Candidate>();
for (const candidate of await loadCandidates()) {
	const host = new URL(candidate.url).hostname;
	if (existingHosts.has(host)) {
		continue;
	}
	const found = byHost.get(host);
	if (found) {
		found.domains.push(...candidate.domains);
	} else {
		byHost.set(host, {
			...candidate,
			domains: [...candidate.domains],
		});
	}
}

const candidates = [...byHost.values()];
process.stderr.write(`Checking ${candidates.length} candidate pages...\n`);
const detections: Detection[] = await Readable.from(candidates).map(
	async (candidate: Candidate): Promise<Detection> => {
		if (candidate.knownOther) {
			return { platform: 'other' };
		}
		return await detect(new URL(candidate.url).origin);
	},
	// eslint-disable-next-line unicorn/no-array-method-this-argument -- Readable options, not thisArg
	{ concurrency: 40 },
).toArray();

type Resolved = ProviderData & {
	id: string;
	hostMatchesId: boolean;
};

const skipped: string[] = [];
const resolvedPages: Resolved[] = [];
for (const [index, candidate] of candidates.entries()) {
	const detection = detections[index];
	if (!detection) {
		skipped.push(`${candidate.name} (${candidate.url}): unreachable`);
		continue;
	}

	const name = cleanName(candidate.name);
	const id = slugify(name);
	if (!id || Object.hasOwn(existing, id)) {
		skipped.push(`${name} (${candidate.url}): ID "${id}" is taken`);
		continue;
	}

	const url = new URL(candidate.url);
	resolvedPages.push({
		id,
		name,
		url: detection.platform === 'other' ? candidate.url.replace(/\/$/, '') : url.origin,
		platform: detection.platform,
		domains: candidate.domains,
		hostMatchesId: url.hostname.replaceAll(/[^a-z\d]/g, '').includes(id),
	});
}

// Pages with the same ID are treated as one service. Domains are combined, and the best page wins:
// checkable pages first, then pages whose host contains the ID, then earlier sources.
const rank = (page: Resolved) => (page.platform === 'other' ? 2 : 0) + (page.hostMatchesId ? 0 : 1);
const added: Record<string, ProviderData> = {};
for (const [id, group] of Map.groupBy(resolvedPages, page => page.id)) {
	const [best, ...rest] = group.toSorted((a, b) => rank(a) - rank(b));
	for (const page of rest) {
		skipped.push(`${page.name} (${page.url}): same ID as ${best!.url}`);
	}
	const domains = normalizeDomains(group.flatMap(page => page.domains))
		.filter(domain => !claimedDomains.has(domain));
	for (const domain of domains) {
		claimedDomains.add(domain);
	}
	added[id] = {
		name: best!.name,
		url: best!.url,
		platform: best!.platform,
		domains,
	};
}

const counts = Object.groupBy(Object.values(added), provider => provider.platform);
process.stderr.write([
	`New: ${Object.keys(added).length} (${Object.entries(counts).map(([platform, list]) => `${platform}: ${list!.length}`).join(', ')})`,
	`Skipped ${skipped.length}:`,
	...skipped.map(line => `  ${line}`),
	'',
].join('\n'));

if (argv.flags.write) {
	const merged = Object.fromEntries(
		Object.entries({
			...existing,
			...added,
		}).sort(([a], [b]) => (a < b ? -1 : 1)),
	);
	await fs.writeFile(providersPath, `${JSON.stringify(merged, null, '\t')}\n`);
	process.stderr.write(`Wrote ${providersPath.pathname}\n`);
} else {
	process.stdout.write(`${JSON.stringify(added, null, '\t')}\n`);
}
