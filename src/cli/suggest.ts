import { providers, searchProviders } from './catalog.ts';

const levenshtein = (a: string, b: string) => {
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i += 1) {
		const current = [i];
		for (let j = 1; j <= b.length; j += 1) {
			current[j] = Math.min(
				previous[j]! + 1,
				current[j - 1]! + 1,
				previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		previous = current;
	}
	return previous[b.length]!;
};

const maxSuggestions = 5;

/** Catalog IDs and aliases that the user may have meant, closest first */
export const suggest = (input: string) => {
	const normalized = input.toLowerCase();
	const close = providers
		.flatMap(provider => [provider.id, ...(provider.aliases ?? [])])
		.filter(name => name.startsWith(normalized) || levenshtein(normalized, name) <= 2);
	const related = searchProviders(normalized).map(provider => provider.id);
	return [...new Set([...close, ...related])]
		.map(name => ({
			name,
			distance: levenshtein(normalized, name),
		}))
		.sort((a, b) => a.distance - b.distance)
		.slice(0, maxSuggestions)
		.map(({ name }) => name);
};
