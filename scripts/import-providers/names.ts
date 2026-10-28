export const cleanName = (rawName: string) => {
	const name = rawName
		.replace(/\s*[-|:]\s*status( page)?$/i, '')
		.replace(/\s+(system |service )?status( page)?$/i, '')
		.replace(/^status( page)?\s*[-|:]\s*/i, '')
		.replace(/-+$/, '')
		.trim();

	// Slug-style names such as "cockroach-labs" become "Cockroach Labs"
	if (name.includes('-') && !/[A-Z]/.test(name)) {
		return name.split(/-+/).map(word => word[0]!.toUpperCase() + word.slice(1)).join(' ');
	}
	return name;
};

export const slugify = (name: string) => name
	.normalize('NFKD')
	.toLowerCase()
	.replaceAll('&', 'and')
	.replaceAll(/[^a-z\d]+/g, '');

/** Normalizes `*.example.com` and drops domains already covered by a parent domain */
export const normalizeDomains = (domains: string[]) => {
	const unique = [...new Set(domains.map(domain => domain.replace(/^\*\./, '').toLowerCase()))];
	return unique.filter(domain => !unique.some(other => domain.endsWith(`.${other}`))).sort();
};
