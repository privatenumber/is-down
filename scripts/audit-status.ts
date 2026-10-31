/**
 * Measures how often services look degraded, to inform catalog defaults such as `defaultScope`.
 *
 * - Incident time: the share of the last --days with an impactful incident open,
 *   from each page's incident list.
 * - With --history: Wayback Machine captures of each page's summary, counting captures with
 *   components that were not operational, in total and within the provider's default scope.
 *
 * Prints Markdown tables. See notes/is-down/cloudflare-default-scope.md for a recorded run.
 */
import { setTimeout } from 'node:timers/promises';
import { cli } from 'cleye';
import { defaultProviders, findProvider } from '../src/cli/catalog.ts';
import type { Provider } from '../src/providers/index.ts';
import type { ApiIncident, ApiSummary } from '../src/status/statuspage.ts';
import { scopeComponents } from '../src/status/scope.ts';

const day = 24 * 60 * 60 * 1000;

// Incidents left open for weeks, such as a long-running known issue, would dominate the share
const maxIncidentDuration = 7 * day;

const argv = cli({
	name: 'audit-status',
	parameters: ['[services...]'],
	flags: {
		days: {
			type: Number,
			default: 14,
			description: 'Incident window in days',
		},
		history: {
			type: Boolean,
			description: 'Also analyze Wayback Machine captures of each summary',
		},
	},
});

const services = argv._.services.map((id) => {
	const provider = findProvider(id);
	if (!provider || provider.platform === 'other') {
		throw new Error(`"${id}" is not a catalog service with a status API`);
	}
	return provider;
});

const fetchJson = async <T>(url: string): Promise<T> => {
	const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
	if (!response.ok) {
		throw new Error(`HTTP ${response.status} for ${url}`);
	}
	return await response.json() as T;
};

const percent = (part: number, total: number) => `${((100 * part) / total).toFixed(1)}%`;

const startTime = (incident: ApiIncident) => Date.parse(incident.started_at ?? incident.created_at);

/** Milliseconds within [start, end) covered by at least one incident */
const coveredTime = (incidents: ApiIncident[], start: number, end: number) => {
	const intervals = incidents
		.map(incident => [
			Math.max(startTime(incident), start),
			Math.min(incident.resolved_at ? Date.parse(incident.resolved_at) : end, end),
		])
		.filter(([from, to]) => from < to)
		.sort((a, b) => a[0] - b[0]);

	let covered = 0;
	let reached = start;
	for (const [from, to] of intervals) {
		covered += Math.max(0, to - Math.max(from, reached));
		reached = Math.max(reached, to);
	}
	return covered;
};

/** Leaf components within the provider's default scope, as the CLI selects them */
const defaultScopeIds = (provider: Provider, summary: ApiSummary) => {
	const names = new Map(summary.components.map(component => [component.id, component.name]));
	const request = {
		url: provider.url,
		provider,
		incidentIds: [],
	};
	return new Set(
		scopeComponents(summary.components, request, provider.defaultScope, names)
			.map(component => component.id),
	);
};

const auditIncidents = async (provider: Provider, days: number) => {
	const [summary, { incidents }] = await Promise.all([
		fetchJson<ApiSummary>(`${provider.url}/api/v2/summary.json`),
		fetchJson<{ incidents: ApiIncident[] }>(`${provider.url}/api/v2/incidents.json`),
	]);
	const scopedIds = defaultScopeIds(provider, summary);
	const end = Date.now();
	const endTime = (incident: ApiIncident) => (
		incident.resolved_at ? Date.parse(incident.resolved_at) : end
	);

	// The list holds only the most recent incidents, so it may not reach back the whole window
	const oldest = Math.min(end, ...incidents.map(startTime));
	const start = Math.max(end - days * day, oldest);
	const impactful = incidents.filter(incident => (
		incident.impact !== 'none'
		&& endTime(incident) - startTime(incident) <= maxIncidentDuration

		// Same as the CLI: unlinked incidents count, linked ones only when they touch the scope
		&& (
			!incident.components?.length
			|| incident.components.some(component => scopedIds.has(component.id))
		)
	));
	const severe = impactful.filter(incident => incident.impact === 'major' || incident.impact === 'critical');
	return [
		provider.name,
		`${((end - start) / day).toFixed(1)} days`,
		String(impactful.filter(incident => startTime(incident) >= start).length),
		percent(coveredTime(impactful, start, end), end - start),
		percent(coveredTime(severe, start, end), end - start),
	];
};

const waybackCaptures = async (url: string) => {
	const cdx = new URL('https://web.archive.org/cdx/search/cdx');
	cdx.search = new URLSearchParams({
		url,
		output: 'json',
		fl: 'timestamp',
		filter: 'statuscode:200',

		// One capture per hour at most
		collapse: 'timestamp:10',
	}).toString();
	const rows = await fetchJson<string[][]>(cdx.toString());
	return rows.slice(1).map(([timestamp]) => timestamp!);
};

// The Wayback Machine refuses connections from clients that send requests too quickly
const fetchCapture = async (timestamp: string, url: string, attempts = 4): Promise<ApiSummary> => {
	try {
		return await fetchJson<ApiSummary>(`https://web.archive.org/web/${timestamp}id_/${url}`);
	} catch (error) {
		if (attempts <= 1) {
			throw error;
		}
		await setTimeout(30_000);
		return await fetchCapture(timestamp, url, attempts - 1);
	}
};

const auditHistory = async (provider: Provider) => {
	const summaryUrl = `${provider.url}/api/v2/summary.json`;
	const timestamps = await waybackCaptures(summaryUrl);
	const counts = {
		captures: 0,
		anyComponent: 0,
		inDefaultScope: 0,
		indicator: 0,
		failed: 0,
	};

	// Sequential and spaced out to stay under the Wayback Machine's rate limit
	for (const timestamp of timestamps) {
		await setTimeout(1500);
		try {
			const summary = await fetchCapture(timestamp, summaryUrl);
			const scopedIds = defaultScopeIds(provider, summary);
			const notOperational = summary.components.filter(component => (
				!component.group && component.status !== 'operational'
			));

			counts.captures += 1;
			counts.anyComponent += Number(notOperational.length > 0);
			const inScope = notOperational.some(component => scopedIds.has(component.id));
			counts.inDefaultScope += Number(inScope);
			counts.indicator += Number(summary.status.indicator !== 'none');
		} catch (error) {
			counts.failed += 1;
			console.error(`${provider.id} ${timestamp}: ${(error as Error).message}`);
		}
	}

	return [
		provider.name,
		`${timestamps[0]?.slice(0, 8) ?? '-'} to ${timestamps.at(-1)?.slice(0, 8) ?? '-'}`,
		String(counts.captures),
		percent(counts.anyComponent, counts.captures),
		percent(counts.inDefaultScope, counts.captures),
		percent(counts.indicator, counts.captures),
		String(counts.failed),
	];
};

const table = (header: string[], rows: string[][]) => [
	`| ${header.join(' | ')} |`,
	`| ${header.map(() => '---').join(' | ')} |`,
	...rows.map(row => `| ${row.join(' | ')} |`),
].join('\n');

const providers = services.length > 0 ? services : defaultProviders;

console.log(`Incidents with an impact other than none, open ${maxIncidentDuration / day} days or less, as of ${new Date().toISOString()}:\n`);
console.log(table(
	['Service', 'Window', 'Incidents started', 'Time with one open', 'Major or critical'],
	await Promise.all(providers.map(provider => auditIncidents(provider, argv.flags.days))),
));

if (argv.flags.history) {
	const rows = [];
	for (const provider of providers) {
		rows.push(await auditHistory(provider));
	}
	console.log('\nWayback Machine captures of summary.json, at most one per hour:\n');
	console.log(table(
		[
			'Service',
			'Range',
			'Captures',
			'Any component not operational',
			'Within default scope',
			'Indicator not none',
			'Failed',
		],
		rows,
	));
}
