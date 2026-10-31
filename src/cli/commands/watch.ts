import { styleText } from 'node:util';
import { cli } from 'cleye';
import type { Incident, IncidentEvent } from '../../status/types.ts';
import { watchIncident } from '../../status/watch-incident.ts';
import { resolvedStatuses } from '../../status/statuspage.ts';
import { parseDuration, formatDuration } from '../duration.ts';
import {
	style, formatUpdate, formatWatchedIncident, formatResolved,
} from '../format.ts';
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
			type: (value: string) => {
				const duration = parseDuration(value);
				if (duration === 0) {
					throw new Error('--max-wait must be longer than 0');
				}
				return duration;
			},
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

const [page] = resolveTargets([argv._.incident]);
const [incidentId] = page?.incidentIds ?? [];
if (!page || !incidentId) {
	throw new TargetError(`"${argv._.incident}" is not an incident URL`, [
		'Pass the URL of an incident on a status page, such as https://status.npmjs.org/incidents/abc123',
		'Run "is-down <service>" to list a service\'s active incidents and their URLs.',
	]);
}

const print = (line: string) => {
	process.stdout.write(`${line}\n`);
};

// Quotes an argument only when the shell would otherwise split or expand it
const shellQuote = (argument: string) => (
	/^[\w./:=@%+-]+$/.test(argument) ? argument : `'${argument.replaceAll('\'', String.raw`'\''`)}'`
);

// Repeats this exact invocation, so a rerun keeps the same flags
const rerunCommand = `npx is-down ${process.argv.slice(2).map(shellQuote).join(' ')}`;

const keepWatching = (state: string) => (
	`Still ${state}. To keep watching, run this again in the background: ${rerunCommand}`
);

/** Prints one event, and returns an exit code when the watch should stop */
const printEvent = (event: IncidentEvent, checkedBefore: boolean) => {
	if (event.type === 'error') {
		// Until a check succeeds, a missing incident or an unsupported page is not worth
		// retrying. A failed request can be temporary, so the watch continues.
		if (!checkedBefore && event.kind !== 'request') {
			process.stderr.write(`${styleText('red', 'Error:', { stream: process.stderr })} ${event.error}\n`);
			return 2;
		}
		print(`${style('red', '!')} Could not check the incident: ${event.error}`);
		return;
	}

	const lines = event.type === 'incident'
		? formatWatchedIncident(event.incident)
		: event.updates.map(formatUpdate);
	lines.forEach(print);

	// When the updates resolve the incident, the watch finishes on its own
	const { status } = event.incident;
	if (event.type === 'update' && argv.flags.untilUpdate && !resolvedStatuses.has(status)) {
		print(keepWatching(status));
		return 1;
	}
};

const { maxWait } = argv.flags;
const maxWaitSignal = maxWait === undefined ? undefined : AbortSignal.timeout(maxWait);
const startedWatching = Date.now();

const isMaxWaitAbort = (error: unknown) => (
	maxWaitSignal?.aborted === true && error === maxWaitSignal.reason
);

// Lets tests poll faster than the default of once a minute
const interval = Number(process.env.IS_DOWN_WATCH_INTERVAL) || undefined;

/** Prints the watch and returns the exit code */
const watch = async () => {
	let incident: Incident | undefined;
	try {
		for await (const event of watchIncident(`${page.url}/incidents/${incidentId}`, {
			interval,
			signal: maxWaitSignal,
		})) {
			const exitCode = printEvent(event, incident !== undefined);
			if (event.type !== 'error') {
				incident = event.incident;
			}
			if (exitCode !== undefined) {
				return exitCode;
			}
		}
	} catch (error) {
		if (!isMaxWaitAbort(error)) {
			throw error;
		}
		const status = incident?.status ?? 'unchecked';
		print(keepWatching(`${status} after ${formatDuration(Date.now() - startedWatching)}`));
		return 124;
	}

	// The watch finishes only after a successful check finds the incident resolved
	if (incident) {
		print(formatResolved(incident));
	}
	return 0;
};

process.exitCode = await watch();
