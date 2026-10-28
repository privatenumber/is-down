import type { Platform } from 'is-down/providers';

export type Detection = { platform: Platform } | undefined;

const ulid = /^[\dA-HJKMNP-TV-Z]{26}$/;

type Summary = {
	page?: { id?: string };
	status?: { indicator?: unknown };
	components?: unknown;
};

const parseSummary = (body: string): Summary | undefined => {
	try {
		return JSON.parse(body) as Summary;
	} catch {
		// An HTML or error response means the page has no Statuspage-compatible API
		return undefined;
	}
};

/** Detects a status page's platform. Returns `undefined` when the page is unreachable. */
export const detect = async (origin: string): Promise<Detection> => {
	let body: string;
	try {
		const response = await fetch(`${origin}/api/v2/summary.json`, { signal: AbortSignal.timeout(8000) });
		body = await response.text();
	} catch {
		// Unreachable pages are dropped rather than guessed at
		return undefined;
	}

	const summary = parseSummary(body);
	if (typeof summary?.status?.indicator !== 'string' || !Array.isArray(summary.components)) {
		return { platform: 'other' };
	}
	return {
		platform: ulid.test(summary.page?.id ?? '') ? 'incident.io' : 'statuspage',
	};
};
