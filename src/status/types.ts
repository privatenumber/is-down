import type { Provider } from '../providers/types.ts';
import type { ComponentStatus } from './component-status.ts';

export type Component = {
	name: string;
	group?: string;
	status: ComponentStatus;
};

export type IncidentUpdate = {

	/** The incident's status as of this update */
	status: string;
	body: string;
	createdAt: string;
};

export type Incident = {
	id: string;
	name: string;

	/** `investigating`, `identified`, `monitoring`, `resolved`, or `postmortem` */
	status: string;

	/** `none`, `minor`, `major`, or `critical` */
	impact: string;
	url: string;
	startedAt: string;
	resolvedAt?: string;
	latestUpdate?: IncidentUpdate;

	/** Affected component names. Empty when the page does not link incidents to components. */
	components: string[];
};

type ServiceBase = {
	id?: string;
	name: string;
	url: string;

	/** The `components` option, when the check is scoped to components */
	scope?: string[];
};

export type ServiceResult = ServiceBase & ({
	state: 'operational' | 'degraded';
	description: string;

	/** Components in scope, including operational ones */
	components: Component[];

	/** Unresolved incidents that affect the components in scope */
	incidents: Incident[];

	/** Incidents resolved within the `since` window that affected the components in scope */
	recentIncidents: Incident[];

	/** Incidents requested by URL, regardless of scope or age */
	requestedIncidents: Incident[];
} | {
	state: 'error';
	error: string;
});

export type GetStatusOptions = {

	/**
	 * Component selectors to scope the check to, such as `['install']` for npm.
	 * Matches component and group names. Defaults to every component.
	 */
	components?: string[];

	/** IDs of incidents to include in `requestedIncidents`, regardless of age */
	incidents?: string[];

	/** Include incidents resolved within this many milliseconds. Defaults to 1 hour. `0` disables. */
	since?: number;

	/**
	 * Aborts the check. Defaults to `AbortSignal.timeout(10_000)`. A passed signal replaces the
	 * default timeout. A timeout signal returns `state: 'error'`. Any other abort rejects with
	 * the signal's reason.
	 */
	signal?: AbortSignal;
};

export type WatchIncidentOptions = {

	/** Milliseconds between checks. Defaults to 1 minute. */
	interval?: number;

	/** Request timeout per check in milliseconds. Defaults to 10 seconds. */
	timeout?: number;

	/** Stops the watch. The iterator rejects with the signal's reason. */
	signal?: AbortSignal;
};

export type IncidentEvent = {

	/** The first successful check */
	type: 'incident';
	incident: Incident;
} | {

	/** A check that found updates posted since the previous check */
	type: 'update';
	incident: Incident;

	/** The new updates, oldest first */
	updates: IncidentUpdate[];
} | {

	/** A check that failed. The watch continues. */
	type: 'error';
	error: string;
};

/** A check after its target and options are resolved */
export type PageRequest = {

	/** Root URL of the status page */
	url: string;
	provider?: Provider;
	scope?: string[];
	incidentIds: string[];
};
