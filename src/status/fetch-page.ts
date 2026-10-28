import type { PageRequest } from './types.ts';
import {
	type ApiIncident,
	type ApiSummary,
	PageError,
	fetchSummary,
	fetchIncidents,
	fetchIncident,
} from './statuspage.ts';

export type PageData = {
	summary: ApiSummary;
	activeIncidents: ApiIncident[];
	incidentList: ApiIncident[];
	requestedIncidents: ApiIncident[];
};

const unresolvedStatuses = new Set(['investigating', 'identified', 'monitoring']);

/** Fetches the summary and, when needed, the incident list and requested incidents */
export const fetchPageData = async (
	request: PageRequest,
	since: number,
	signal: AbortSignal,
): Promise<PageData> => {
	const needsIncidentList = since > 0 || request.incidentIds.length > 0;
	const [summary, fetchedIncidentList] = await Promise.all([
		fetchSummary(request.url, signal),
		needsIncidentList ? fetchIncidents(request.url, signal) : undefined,
	]);

	// incident.io pages omit `incidents` from the summary
	const incidentList = fetchedIncidentList ?? (
		summary.incidents ? [] : await fetchIncidents(request.url, signal)
	);
	const activeIncidents = summary.incidents ?? incidentList.filter(
		incident => unresolvedStatuses.has(incident.status),
	);

	const requestedIncidents = await Promise.all(request.incidentIds.map(async (id) => {
		const incident = (
			incidentList.find(item => item.id === id)
			?? await fetchIncident(request.url, id, signal)
		);
		if (!incident) {
			throw new PageError(`Incident ${id} not found`);
		}
		return incident;
	}));

	return {
		summary,
		activeIncidents,
		incidentList,
		requestedIncidents,
	};
};
