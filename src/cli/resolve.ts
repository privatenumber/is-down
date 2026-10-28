import type { Provider } from '../providers/index.ts';
import {
	defaultProviders,
	findProvider,
	findProviderByUrl,
} from './catalog.ts';
import { suggest } from './suggest.ts';

export type PageTarget = {

	/** Root URL of the status page */
	url: string;
	provider?: Provider;

	/** Component selectors to scope the check to. `undefined` checks every component. */
	selectors?: string[];

	/** Incidents to highlight, from incident URLs */
	incidentIds: string[];
};

export class TargetError extends Error {
	name = 'TargetError';

	/** Suggestions for fixing the input, printed below the message */
	hints: string[];

	constructor(message: string, hints: string[] = []) {
		super(message);
		this.hints = hints;
	}
}

type Target = {
	url: string;
	provider?: Provider;
	selector?: string;
	incidentId?: string;
};

const parseUrlTarget = (input: string): Target => {
	let url: URL;
	let selector: string | undefined;
	try {
		url = new URL(input.includes('://') ? input : `https://${input}`);
		selector = decodeURIComponent(url.hash.slice(1)) || undefined;
	} catch {
		// URL parsing throws a TypeError and malformed percent-encoding throws a URIError
		throw new TargetError(`Invalid URL "${input}"`);
	}

	const provider = findProviderByUrl(url);

	// Paths are only meaningful on the status page itself, not on other service domains
	const isStatusPage = !provider || new URL(provider.url).hostname === url.hostname;
	const incidentId = isStatusPage ? url.pathname.match(/\/incidents\/([^/]+)/)?.[1] : undefined;

	return {
		url: provider?.url ?? url.origin,
		provider,
		selector,
		incidentId,
	};
};

const parseTarget = (input: string): Target => {
	if (input.includes('://')) {
		return parseUrlTarget(input);
	}

	const separatorIndex = input.indexOf(':');
	const name = separatorIndex === -1 ? input : input.slice(0, separatorIndex);
	const provider = findProvider(name);
	if (provider) {
		return {
			url: provider.url,
			provider,
			selector: separatorIndex === -1 ? undefined : (input.slice(separatorIndex + 1) || undefined),
		};
	}

	// A domain without a scheme must belong to a catalog entry, so a mistyped name never
	// becomes a request to an arbitrary website. Other status pages need a full URL.
	const isDomain = name.includes('.');
	if (isDomain) {
		const target = parseUrlTarget(input);
		if (target.provider) {
			return target;
		}
	}

	const suggestions = suggest(name);
	throw new TargetError(`Unknown service "${name}"`, [
		...(suggestions.length > 0 ? [`Did you mean: ${suggestions.join(', ')}?`] : []),
		'Run "is-down list" to see known services.',
		'To check a status page outside the catalog, pass its full URL, such as https://status.example.com',
	]);
};

/**
 * Groups targets by status page so each page is fetched once.
 * A page is scoped to selectors only when every target for it has one.
 * The `defaults` keyword expands to the default services.
 */
export const resolveTargets = (inputs: string[]): PageTarget[] => {
	const expanded = inputs.flatMap(input => (
		input.toLowerCase() === 'defaults' ? defaultProviders.map(provider => provider.id) : [input]
	));
	const pages = new Map<string, PageTarget>();
	for (const input of expanded) {
		const target = parseTarget(input);
		let page = pages.get(target.url);
		if (!page) {
			page = {
				url: target.url,
				provider: target.provider,
				selectors: [],
				incidentIds: [],
			};
			pages.set(target.url, page);
		}

		if (target.incidentId) {
			page.incidentIds.push(target.incidentId);
		}

		if (!target.selector) {
			page.selectors = undefined;
		} else if (page.selectors) {
			page.selectors.push(target.selector);
		}
	}
	return [...pages.values()];
};
