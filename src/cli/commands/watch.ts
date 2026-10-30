import { setTimeout as sleep } from 'node:timers/promises';
import { styleText } from 'node:util';
import { cli } from 'cleye';
import {
	type ApiIncident,
	type ApiIncidentUpdate,
	PageError,
	fetchIncident,
	fetchIncidents,
} from '../../status/statuspage.ts';
import { parseDuration, formatDuration } from '../duration.ts';
import { resolveTargets, TargetError } from '../resolve.ts';

const argv = cli({
	name: 'watch',
	parameters: ['<incident>'],
	flags: {
		untilUpdate: {
			type: Boolean,
			description: 'Exit at the next update instead of waiting for the incident to resolve',
		},
		maxWait: {
			type: parseDuration,
			description: 'Stop watching after this long (e.g. 10m, 1h) and exit 124',
			placeholder: '<duration>',
		},
	},
	strictFlags: true,
	throwOnExit: true,
	help: {
		description: [
			'Watch an incident and print each update as it is posted, until the incident resolves.',
			'',
			'Exit codes: 0 resolved, 1 new update (--until-update), 124 --max-wait reached, 2 incident unreadable or invalid input',
		].join('\n'),
		examples: [
			'is-down watch https://status.npmjs.org/incidents/abc123',
			'is-down watch https://status.npmjs.org/incidents/abc123 --until-update',
			'is-down watch https://status.npmjs.org/incidents/abc123 --max-wait 30m',
		],
	},
});

// Statuspage serves summaries from a CDN cache, so polling more often than this finds nothing new.
// The environment variable lets tests poll faster.
const pollInterval = Number(process.env.IS_DOWN_WATCH_INTERVAL) || 60_000;

const requestTimeout = 10_000;

const resolvedStatuses = new Set(['resolved', 'postmortem']);

const [page] = resolveTargets([argv._.incident]);
const [incidentId] = page?.incidentIds ?? [];
if (!page || !incidentId) {
	throw new TargetError(`"${argv._.incident}" is not an incident URL`, [
		'Pass the URL of an incident on a status page, such as https://status.npmjs.org/incidents/abc123',
		'Run "is-down <service>" to list a service\'s active incidents and their URLs.',
	]);
}
const pageUrl = page.url;
const incidentUrl = `${pageUrl}/incidents/${incidentId}`;

// incident.io pages have no single-incident endpoint, so after the first 404 the list is used
let useIncidentList = false;

const fetchWatchedIncident = async () => {
	const signal = AbortSignal.timeout(requestTimeout);
	if (!useIncidentList) {
		const incident = await fetchIncident(pageUrl, incidentId, signal);
		if (incident) {
			return incident;
		}
		useIncidentList = true;
	}

	const incidents = await fetchIncidents(pageUrl, signal);
	const incident = incidents.find(item => item.id === incidentId);
	if (!incident) {
		throw new PageError(`Incident ${incidentId} not found on ${pageUrl}`);
	}
	return incident;
};

/** Returns the incident, or the reason it could not be read */
const poll = async (): Promise<ApiIncident | string> => {
	try {
		return await fetchWatchedIncident();
	} catch (error) {
		if (error instanceof PageError) {
			return error.message;
		}
		if (error instanceof DOMException && error.name === 'TimeoutError') {
			return `Timed out reaching ${pageUrl}`;
		}
		throw error;
	}
};

const style = (format: Parameters<typeof styleText>[0], text: string) => (
	styleText(format, text, { stream: process.stdout })
);

// Each event is one line, so tools that treat every output line as an event receive it whole
const print = (line: string) => {
	process.stdout.write(`${line}\n`);
};

const formatUpdate = (incident: ApiIncident, update: ApiIncidentUpdate) => (
	`  ${style('bold', update.status ?? incident.status)} · ${update.body.replaceAll(/\s+/g, ' ').trim()}`
);

const sortUpdates = (incident: ApiIncident) => (incident.incident_updates ?? []).slice().sort(
	(a, b) => (a.created_at < b.created_at ? -1 : (a.created_at > b.created_at ? 1 : 0)),
);

// Repeats this exact invocation, so a rerun keeps the same flags
const rerunCommand = `npx is-down ${process.argv.slice(2).join(' ')}`;

const startedWatching = Date.now();

const first = await poll();
if (typeof first === 'string') {
	process.stderr.write(`${style('red', 'Error:')} ${first}\n`);
	process.exitCode = 2;
} else {
	const startedAt = Date.parse(first.started_at ?? first.created_at);
	const impact = first.impact === 'none' ? '' : ` [${first.impact}]`;
	print(`${style('yellow', '●')} ${style('bold', first.name)}${impact} · started ${formatDuration(Date.now() - startedAt)} ago · ${incidentUrl}`);

	const updates = sortUpdates(first);
	const latest = updates.at(-1);
	if (latest) {
		print(formatUpdate(first, latest));
	}
	let lastSeen = latest?.created_at ?? '';
	let incident = first;

	while (!resolvedStatuses.has(incident.status)) {
		const remaining = argv.flags.maxWait === undefined
			? pollInterval
			: argv.flags.maxWait - (Date.now() - startedWatching);
		if (remaining <= 0) {
			print(`Still ${incident.status} after ${formatDuration(argv.flags.maxWait!)}. To keep watching, run: ${rerunCommand}`);
			process.exitCode = 124;
			break;
		}
		await sleep(Math.min(pollInterval, remaining));

		const next = await poll();
		if (typeof next === 'string') {
			print(`${style('red', '!')} Could not check the incident: ${next}`);
			continue;
		}

		incident = next;
		const seenUntil = lastSeen;
		const newUpdates = sortUpdates(next).filter(update => update.created_at > seenUntil);
		for (const update of newUpdates) {
			print(formatUpdate(next, update));
		}
		lastSeen = newUpdates.at(-1)?.created_at ?? lastSeen;

		if (argv.flags.untilUpdate && newUpdates.length > 0 && !resolvedStatuses.has(next.status)) {
			print(`Still ${next.status}. To keep watching, run this again in the background: ${rerunCommand}`);
			process.exitCode = 1;
			break;
		}
	}

	if (resolvedStatuses.has(incident.status)) {
		const resolvedAt = incident.resolved_at ? Date.parse(incident.resolved_at) : Date.now();
		print(`${style('green', '✓')} Resolved · lasted ${formatDuration(resolvedAt - startedAt)}`);
	}
}
