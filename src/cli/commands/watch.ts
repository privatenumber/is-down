import { styleText } from 'node:util';
import { cli } from 'cleye';
import type { Incident, IncidentUpdate } from '../../status/types.ts';
import { watchIncident, resolvedStatuses } from '../../status/watch-incident.ts';
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

const [page] = resolveTargets([argv._.incident]);
const [incidentId] = page?.incidentIds ?? [];
if (!page || !incidentId) {
	throw new TargetError(`"${argv._.incident}" is not an incident URL`, [
		'Pass the URL of an incident on a status page, such as https://status.npmjs.org/incidents/abc123',
		'Run "is-down <service>" to list a service\'s active incidents and their URLs.',
	]);
}

const style = (format: Parameters<typeof styleText>[0], text: string) => (
	styleText(format, text, { stream: process.stdout })
);

// Each event is one line, so tools that treat every output line as an event receive it whole
const print = (line: string) => {
	process.stdout.write(`${line}\n`);
};

const formatUpdate = (update: IncidentUpdate) => (
	`  ${style('bold', update.status)} · ${update.body.replaceAll(/\s+/g, ' ').trim()}`
);

// Repeats this exact invocation, so a rerun keeps the same flags
const rerunCommand = `npx is-down ${process.argv.slice(2).join(' ')}`;

const { maxWait } = argv.flags;
const maxWaitSignal = maxWait === undefined ? undefined : AbortSignal.timeout(maxWait);

/** Prints the watch and returns the exit code */
const watch = async () => {
	let incident: Incident | undefined;
	try {
		for await (const event of watchIncident(`${page.url}/incidents/${incidentId}`, {
			// Lets tests poll faster than the default of once a minute
			interval: Number(process.env.IS_DOWN_WATCH_INTERVAL) || undefined,
			signal: maxWaitSignal,
		})) {
			if (event.type === 'error') {
				// Before the first successful check, the incident may not exist, so stop
				if (!incident) {
					process.stderr.write(`${styleText('red', 'Error:', { stream: process.stderr })} ${event.error}\n`);
					return 2;
				}
				print(`${style('red', '!')} Could not check the incident: ${event.error}`);
				continue;
			}

			incident = event.incident;
			if (event.type === 'incident') {
				const impact = incident.impact === 'none' ? '' : ` [${incident.impact}]`;
				print(`${style('yellow', '●')} ${style('bold', incident.name)}${impact} · started ${formatDuration(Date.now() - Date.parse(incident.startedAt))} ago · ${incident.url}`);
				if (incident.latestUpdate) {
					print(formatUpdate(incident.latestUpdate));
				}
				continue;
			}

			print(formatUpdate(event.update));
			// When the update resolves the incident, the watch finishes on its own
			if (argv.flags.untilUpdate && !resolvedStatuses.has(incident.status)) {
				print(`Still ${incident.status}. To keep watching, run this again in the background: ${rerunCommand}`);
				return 1;
			}
		}
	} catch (error) {
		if (!maxWaitSignal?.aborted || error !== maxWaitSignal.reason) {
			throw error;
		}
		print(`Still ${incident?.status ?? 'unresolved'} after ${formatDuration(maxWait!)}. To keep watching, run: ${rerunCommand}`);
		return 124;
	}

	// The watch finishes only once the incident resolves
	const resolvedAt = incident!.resolvedAt ? Date.parse(incident!.resolvedAt) : Date.now();
	print(`${style('green', '✓')} Resolved · lasted ${formatDuration(resolvedAt - Date.parse(incident!.startedAt))}`);
	return 0;
};

process.exitCode = await watch();
