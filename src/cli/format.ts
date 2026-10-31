import { styleText } from 'node:util';
import ansis, { link } from 'ansis';
import type {
	Component, Incident, IncidentUpdate, ServiceResult,
} from '../status/types.ts';
import { type ComponentStatus, statusLabels, worstStatus } from '../status/component-status.ts';
import { formatDuration } from './duration.ts';

type Style = Parameters<typeof styleText>[0];

export const style = (format: Style, text: string) => (
	styleText(format, text, { stream: process.stdout })
);

// Hyperlinks only go to terminals, so CI logs and redirected output stay plain text.
// Without color support, ansis would print "text (url)" instead, so plain text is used there too.
export const linkTo = (url: string, text: string) => (
	process.stdout.isTTY && ansis.isSupported() ? link(url, text) : text
);

export const stateSymbols: Record<ServiceResult['state'], {
	color: Style;
	text: string;
}> = {
	operational: {
		color: 'green',
		text: '✓',
	},
	degraded: {
		color: 'yellow',
		text: '!',
	},
	error: {
		color: 'red',
		text: '✗',
	},
};

const symbol = (state: ServiceResult['state']) => style(stateSymbols[state].color, stateSymbols[state].text);

const statusText = (status: ComponentStatus) => statusLabels[status].toLowerCase();

/** Groups with more affected components than this are summarized in one line */
const maxListedPerGroup = 3;

const maxBodyLength = 200;

const indent = '    ';

const label = (result: ServiceResult) => {
	if (result.state === 'error' || !result.scope) {
		return result.name;
	}
	const names = [...new Set(result.components.map(component => component.name))];
	return `${result.name} › ${names.length <= 3 ? names.join(', ') : `${names.length} components`}`;
};

const formatComponents = (components: Component[]) => {
	const lines: string[] = [];
	for (const [group, members] of Map.groupBy(components, component => component.group)) {
		const affected = members.filter(component => component.status !== 'operational');
		if (group === undefined || affected.length <= maxListedPerGroup) {
			const prefix = group === undefined ? '' : `${group} › `;
			lines.push(...affected.map(component => `${prefix}${component.name}: ${statusText(component.status)}`));
			continue;
		}
		const worst = worstStatus(affected.map(component => component.status));
		lines.push(`${group}: ${affected.length} of ${members.length} affected (worst: ${statusText(worst)})`);
	}
	return lines.map(line => `${indent}${line}`);
};

const truncate = (text: string) => {
	const singleLine = text.replaceAll(/\s+/g, ' ').trim();
	return singleLine.length > maxBodyLength ? `${singleLine.slice(0, maxBodyLength - 1)}…` : singleLine;
};

const impactTag = (incident: Incident) => (incident.impact === 'none' ? '' : ` [${incident.impact}]`);

const formatIncident = (incident: Incident, now: number) => {
	const resolvedAt = incident.resolvedAt ? Date.parse(incident.resolvedAt) : undefined;
	const startedAt = Date.parse(incident.startedAt);
	const lines = resolvedAt === undefined
		? [
			`${style('yellow', '●')} ${incident.name}${impactTag(incident)} · ${incident.status} · started ${formatDuration(now - startedAt)} ago`,
			...(incident.latestUpdate ? [`  ${truncate(incident.latestUpdate.body)}`] : []),
		]
		: [style('dim', `Resolved ${formatDuration(now - resolvedAt)} ago: ${incident.name}${impactTag(incident)} · lasted ${formatDuration(resolvedAt - startedAt)}`)];

	if (incident.components.length > 0) {
		lines.push(style('dim', `  Affected: ${incident.components.join(', ')}`));
	}
	// Active incidents show the command that follows them, which also carries the URL
	lines.push(style('dim', resolvedAt === undefined
		? `  Watch: npx is-down watch ${linkTo(incident.url, incident.url)}`
		: `  ${incident.url}`));
	return lines.map(line => `${indent}${line}`);
};

/** The first line of `is-down watch` */
export const formatWatchedIncident = (incident: Incident, now = Date.now()) => (
	`${style('yellow', '●')} ${style('bold', incident.name)}${impactTag(incident)} · started ${formatDuration(now - Date.parse(incident.startedAt))} ago · ${incident.url}`
);

/** One update as one line, so tools that treat each output line as an event receive it whole */
export const formatUpdate = (update: IncidentUpdate) => (
	`  ${style('bold', update.status)} · ${update.body.replaceAll(/\s+/g, ' ').trim()}`
);

export const formatResults = (results: ServiceResult[], now = Date.now()) => {
	const labels = results.map(label);

	// Only rows that need attention print a description, so only they are aligned
	const width = Math.max(0, ...labels.filter((_, index) => results[index]!.state !== 'operational').map(text => text.length));

	return results.flatMap((result, index) => {
		const plainName = labels[index]!;
		const name = linkTo(result.url, plainName);

		// Padded by the visible name, because a hyperlink adds invisible characters
		const paddedName = () => `${name}${' '.repeat(width - plainName.length)}`;
		if (result.state === 'error') {
			return [`${symbol('error')} ${style('bold', paddedName())}  ${style('red', result.error)}`];
		}

		const headline = result.state === 'operational'
			? `${symbol('operational')} ${style('bold', name)}`
			: `${symbol('degraded')} ${style('bold', paddedName())}  ${result.description}`;
		const shownIds = new Set(
			[...result.incidents, ...result.recentIncidents].map(incident => incident.id),
		);
		return [
			headline,
			...formatComponents(result.components),
			...result.incidents.flatMap(incident => formatIncident(incident, now)),
			...result.requestedIncidents
				.filter(incident => !shownIds.has(incident.id))
				.flatMap(incident => formatIncident(incident, now)),
			...result.recentIncidents.flatMap(incident => formatIncident(incident, now)),
		];
	}).join('\n');
};
