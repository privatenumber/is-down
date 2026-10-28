import * as providerExports from '../providers/index.ts';
import type { Provider } from '../providers/index.ts';

/** Every catalog entry. Importing this module loads the whole catalog. */
export const providers: Provider[] = Object.values(providerExports);

/** The services the CLI checks when no services are passed */
export const defaultProviders: Provider[] = [
	providerExports.npm,
	providerExports.github,
	providerExports.nodejs,
	providerExports.vercel,
	providerExports.cloudflare,
	providerExports.netlify,
];

const byId = new Map(providers.map(provider => [provider.id, provider]));

/** Finds a provider by ID or alias, case-insensitively */
export const findProvider = (idOrAlias: string) => {
	const normalized = idOrAlias.toLowerCase();
	return byId.get(normalized) ?? providers.find(provider => provider.aliases?.includes(normalized));
};

const matchesDomain = (hostname: string, domain: string) => (
	hostname === domain || hostname.endsWith(`.${domain}`)
);

/**
 * Finds the provider that owns a URL, by status page host or service domain.
 * For example, `https://registry.npmjs.org/react` finds npm.
 */
export const findProviderByUrl = ({ hostname }: URL) => providers.find(provider => (
	new URL(provider.url).hostname === hostname
	|| provider.domains.some(domain => matchesDomain(hostname, domain))
));

const words = (text: string) => text.toLowerCase().split(/[^a-z\d]+/);

/**
 * Matches the start of any word in a provider's ID, aliases, name, or domains.
 * A query with a dot matches domains and status page hosts instead.
 */
export const searchProviders = (query: string) => {
	const normalized = query.toLowerCase();
	if (normalized.includes('.')) {
		return providers.filter(provider => (
			provider.domains.some(domain => (
				matchesDomain(normalized, domain) || domain.includes(normalized)
			))
			|| new URL(provider.url).hostname.includes(normalized)
		));
	}
	return providers.filter(provider => [
		provider.id,
		...(provider.aliases ?? []),
		...words(provider.name),
		...provider.domains.flatMap(words),
	].some(word => word.startsWith(normalized)));
};
