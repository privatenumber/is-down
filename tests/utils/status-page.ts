import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

/** JSON body, HTTP status code, or `'hang'` to never respond */
type Route = object | number | 'hang';

export const createStatusPage = async (routes: Record<string, Route>) => {
	const requests: string[] = [];
	const server = http.createServer((request, response) => {
		requests.push(request.url!);
		const route = routes[request.url!] ?? 404;
		if (route === 'hang') {
			return;
		}
		if (typeof route === 'number') {
			response.writeHead(route).end();
			return;
		}
		response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(route));
	});

	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const { port } = server.address() as AddressInfo;

	return {
		url: `http://127.0.0.1:${port}`,
		requests,
		[Symbol.asyncDispose]: async () => {
			server.closeAllConnections();
			server.close();
			await once(server, 'close');
		},
	};
};

type ComponentFixture = {
	id: string;
	name: string;
	status?: string;
	group?: boolean;
	group_id?: string;
};

type IncidentFixture = {
	id: string;
	name: string;
	status?: string;
	impact?: string;
	startedAt?: string;
	resolvedAt?: string | null;
	updates?: string[];
	components?: string[];
};

export const ago = (milliseconds: number) => new Date(Date.now() - milliseconds).toISOString();

export const minutes = (count: number) => count * 60 * 1000;

export const incident = ({
	id,
	name,
	status = 'investigating',
	impact = 'minor',
	startedAt = ago(minutes(30)),
	resolvedAt = null,
	updates = ['We are currently investigating this issue.'],
	components,
}: IncidentFixture) => ({
	id,
	name,
	status,
	impact,
	created_at: startedAt,
	started_at: startedAt,
	resolved_at: resolvedAt,
	incident_updates: updates.map((body, index) => ({
		body,
		created_at: ago(minutes(index)),
		status,
	})),
	...(components && { components: components.map(componentId => ({ id: componentId })) }),
});

export const summary = ({
	indicator = 'none',
	description = 'All Systems Operational',
	components = [],
	incidents,
}: {
	indicator?: string;
	description?: string;
	components?: ComponentFixture[];

	/** Omit to mimic incident.io pages, which leave incidents out of the summary */
	incidents?: ReturnType<typeof incident>[];
} = {}) => ({
	page: {
		id: 'example',
		name: 'Example',
		url: 'https://status.example.com',
	},
	status: {
		indicator,
		description,
	},
	components: components.map(component => ({
		status: 'operational',
		group: false,
		group_id: null,
		...component,
	})),
	...(incidents && { incidents }),
});
