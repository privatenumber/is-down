import type {
	Incident, IncidentUpdate, PageRequest, ServiceResult,
} from './types.ts';
import { type ComponentStatus, statusLabels, worstStatus } from './component-status.ts';
import type { ApiIncident, ApiIncidentUpdate } from './statuspage.ts';
import type { PageData } from './fetch-page.ts';
import { scopeComponents } from './scope.ts';

const getLatestUpdate = (updates: ApiIncidentUpdate[] = []) => {
	let latest: ApiIncidentUpdate | undefined;
	for (const update of updates) {
		if (!latest || update.created_at > latest.created_at) {
			latest = update;
		}
	}
	return latest;
};

export const toIncidentUpdate = (
	incident: ApiIncident,
	update: ApiIncidentUpdate,
): IncidentUpdate => ({
	status: update.status ?? incident.status,
	body: update.body,
	createdAt: update.display_at ?? update.created_at,
});

export const toIncident = (
	incident: ApiIncident,
	pageUrl: string,
	componentNames: Map<string, string>,
): Incident => {
	const latestUpdate = getLatestUpdate(incident.incident_updates);
	return {
		id: incident.id,
		name: incident.name,
		status: incident.status,
		impact: incident.impact,
		url: `${pageUrl}/incidents/${incident.id}`,
		startedAt: incident.started_at ?? incident.created_at,
		resolvedAt: incident.resolved_at ?? undefined,
		latestUpdate: latestUpdate && toIncidentUpdate(incident, latestUpdate),
		components: incident.components?.map(
			component => componentNames.get(component.id) ?? component.id,
		) ?? [],
	};
};

/** The page-level description covers every component, so scoped checks describe their own scope */
const describeScope = (worst: ComponentStatus, degraded: boolean) => (
	(degraded && worst === 'operational') ? 'Active Incident' : statusLabels[worst]
);

/** Applies the degraded rules to fetched page data */
export const evaluatePage = (
	request: PageRequest,
	{
		summary,
		activeIncidents,
		incidentList,
		requestedIncidents,
	}: PageData,
	since: number,
): ServiceResult => {
	// Groups are components too, so this also resolves `group_id`
	const componentNames = new Map(
		summary.components.map(component => [component.id, component.name]),
	);
	const { scope } = request;
	const scoped = scopeComponents(summary.components, request, componentNames);
	const scopedIds = new Set(scoped.map(component => component.id));

	// Incidents not linked to any component are treated as affecting the whole service
	const isRelevant = (incident: ApiIncident) => (
		!scope
		|| !incident.components?.length
		|| incident.components.some(component => scopedIds.has(component.id))
	);

	const activeIds = new Set(activeIncidents.map(incident => incident.id));
	const now = Date.now();
	const recentIncidents = incidentList.filter(incident => (
		!activeIds.has(incident.id)
		&& incident.resolved_at
		&& now - Date.parse(incident.resolved_at) <= since
		&& isRelevant(incident)
	));

	const components = scoped.map(component => ({
		name: component.name,
		group: component.group_id ? componentNames.get(component.group_id) : undefined,
		status: component.status,
	}));
	const convert = (incident: ApiIncident) => toIncident(incident, request.url, componentNames);
	const incidents = activeIncidents.filter(isRelevant).map(convert);
	const worst = worstStatus(components.map(component => component.status));
	const degraded = (
		worst !== 'operational'
		|| incidents.some(incident => incident.impact !== 'none')
		|| (!scope && summary.status.indicator !== 'none')
	);

	return {
		id: request.provider?.id,
		name: request.provider?.name ?? summary.page.name,
		url: request.url,
		scope,
		state: degraded ? 'degraded' : 'operational',
		description: scope ? describeScope(worst, degraded) : summary.status.description,
		components,
		incidents,
		recentIncidents: recentIncidents.map(convert),
		requestedIncidents: requestedIncidents.map(convert),
	};
};
