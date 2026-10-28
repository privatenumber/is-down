export type ComponentStatus = 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage' | 'under_maintenance';

export const statusLabels: Record<ComponentStatus, string> = {
	operational: 'Operational',
	degraded_performance: 'Degraded Performance',
	partial_outage: 'Partial Outage',
	major_outage: 'Major Outage',
	under_maintenance: 'Under Maintenance',
};

const severity: ComponentStatus[] = ['operational', 'under_maintenance', 'degraded_performance', 'partial_outage', 'major_outage'];

export const worstStatus = (statuses: ComponentStatus[]) => severity[
	Math.max(0, ...statuses.map(status => severity.indexOf(status)))
]!;
