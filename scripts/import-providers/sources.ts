import fs from 'node:fs/promises';
import * as sentryList from '@sentry/status-page-list';

export type Candidate = {
	name: string;
	url: string;
	domains: string[];

	/** The source page is known to serve no Statuspage-compatible API */
	knownOther?: boolean;
};

const loadSentry = (): Candidate[] => Object.entries(sentryList)
	.filter(([key]) => key.endsWith('StatusInfo'))
	.map(([, value]) => value as {
		name: string;
		statusPageUrl: string;
		domains: string[];
		isServiceDefunct: boolean;
	})
	.filter(entry => !entry.isServiceDefunct)
	.map(entry => ({
		name: entry.name,
		url: entry.statusPageUrl,
		domains: [...entry.domains],
	}));

const loadIsupmap = async (): Promise<Candidate[]> => {
	// Read as text because Node does not strip types from files in node_modules
	const code = await fs.readFile(new URL(import.meta.resolve('isupmap/src/services.ts')), 'utf8');
	const candidates: Candidate[] = [];
	for (const [line] of code.matchAll(/^\t\{ id: .+$/gm)) {
		const name = line.match(/name: "([^"]+)"/)?.[1];
		const base = line.match(/type: "statuspage", base: "([^"]+)"/)?.[1];
		const rss = line.match(/type: "rss", url: "([^"]+)"/)?.[1];
		const statusUrl = line.match(/statusUrl: "([^"]+)"/)?.[1];
		if (!name) {
			continue;
		}
		if (base) {
			candidates.push({
				name,
				url: base,
				domains: [],
			});
		} else if (rss) {
			// `http` sources ping the service itself, so only RSS sources identify a status page
			candidates.push({
				name,
				url: statusUrl ?? new URL(rss).origin,
				domains: [],
				knownOther: true,
			});
		}
	}
	return candidates;
};

/** Candidates from every source, in order of reliability */
export const loadCandidates = async () => {
	const isupmap = await loadIsupmap();
	return [...loadSentry(), ...isupmap];
};
