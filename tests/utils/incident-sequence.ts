import { minutes } from './status-page.ts';

// One base time for every state, so an update keeps the same timestamp across checks,
// as on a real status page
const baseTime = Date.now();
const ago = (milliseconds: number) => new Date(baseTime - milliseconds).toISOString();

export const incidentPath = '/api/v2/incidents/abc.json';

export type Update = [status: string, body: string, minutesAgo: number];

export const incidentState = (updates: Update[]) => {
	const [status] = updates.at(-1)!;
	const isResolved = status === 'resolved';
	return {
		incident: {
			id: 'abc',
			name: 'Elevated build errors',
			status,
			impact: 'major',
			created_at: ago(minutes(42)),
			started_at: ago(minutes(42)),
			resolved_at: isResolved ? ago(minutes(updates.at(-1)![2])) : null,
			incident_updates: updates.map(([updateStatus, body, minutesAgo]) => ({
				status: updateStatus,
				body,
				created_at: ago(minutes(minutesAgo)),
			})),
		},
	};
};

/** Serves each state once in order, then keeps serving the last one */
export const sequence = (states: (object | number)[]) => {
	let index = 0;
	return {
		get [incidentPath]() {
			const state = states[Math.min(index, states.length - 1)]!;
			index += 1;
			return state;
		},
	};
};

export const investigating: Update = ['investigating', 'We are investigating.', 40];
export const identified: Update = ['identified', 'The cause has been\nidentified.', 20];
export const monitoring: Update = ['monitoring', 'A fix has been deployed.', 10];
export const resolved: Update = ['resolved', 'This incident has been resolved.', 0];
