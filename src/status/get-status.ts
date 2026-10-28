import type { Provider } from '../providers/types.ts';
import type { GetStatusOptions, PageRequest, ServiceResult } from './types.ts';
import { PageError } from './statuspage.ts';
import { fetchPageData } from './fetch-page.ts';
import { evaluatePage } from './evaluate.ts';

const toPageRequest = (target: Provider | string, options: GetStatusOptions): PageRequest => ({
	url: typeof target === 'string' ? new URL(target).origin : target.url,
	provider: typeof target === 'string' ? undefined : target,
	scope: options.components,
	incidentIds: options.incidents ?? [],
});

const errorResult = (request: PageRequest, error: string): ServiceResult => ({
	id: request.provider?.id,
	name: request.provider?.name ?? new URL(request.url).hostname,
	url: request.url,
	scope: request.scope,
	state: 'error',
	error,
});

/**
 * Checks one status page: a provider from `is-down/providers`, or the URL of any
 * Statuspage-compatible page.
 *
 * Network failures, page failures, and timeouts are returned as `state: 'error'`.
 * Throws only for an invalid URL, and rejects with the signal's reason when
 * `options.signal` aborts for another reason.
 */
export const getStatus = async (
	target: Provider | string,
	options: GetStatusOptions = {},
): Promise<ServiceResult> => {
	const request = toPageRequest(target, options);
	if (request.provider?.platform === 'other') {
		return errorResult(
			request,
			`${request.provider.name} has no status API that is-down can read. Check ${request.provider.url}`,
		);
	}

	const {
		since = 60 * 60 * 1000,
		signal = AbortSignal.timeout(5000),
	} = options;
	try {
		const data = await fetchPageData(request, since, signal);
		return evaluatePage(request, data, since);
	} catch (error) {
		if (error instanceof PageError) {
			return errorResult(request, error.message);
		}

		// Timeouts are page failures. Other aborts propagate with their own reason.
		if (error instanceof DOMException && error.name === 'TimeoutError') {
			return errorResult(request, 'Timed out');
		}
		throw error;
	}
};
