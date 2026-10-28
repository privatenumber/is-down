import type { PageRequest } from './types.ts';
import { type ApiComponent, PageError } from './statuspage.ts';

const matchesSelector = (text: string, selector: string) => {
	const lower = text.toLowerCase();

	// A single word matches the start of any word, so "install" matches "Package installation"
	if (/^[a-z\d]+$/.test(selector)) {
		return lower.split(/[^a-z\d]+/).some(word => word.startsWith(selector));
	}
	return lower.includes(selector);
};

/** Returns leaf components in the request's scope, excluding groups and ignored placeholders */
export const scopeComponents = (
	allComponents: ApiComponent[],
	request: PageRequest,
	componentNames: Map<string, string>,
) => {
	const ignored = new Set(request.provider?.ignoreComponents);
	const components = allComponents.filter(
		component => !component.group && !ignored.has(component.name),
	);
	if (!request.scope) {
		return components;
	}

	const getGroup = (component: ApiComponent) => (
		component.group_id ? componentNames.get(component.group_id) : undefined
	);
	const aliases = request.provider?.components ?? {};
	const selected = new Set<ApiComponent>();
	for (const rawSelector of request.scope) {
		const selector = rawSelector.toLowerCase();
		const aliasTarget = Object.hasOwn(aliases, selector)
			? aliases[selector]!.toLowerCase()
			: undefined;
		const matched = components.filter((component) => {
			if (aliasTarget) {
				return component.name.toLowerCase() === aliasTarget;
			}
			const group = getGroup(component);
			return (
				matchesSelector(component.name, selector)
				|| (group !== undefined && matchesSelector(group, selector))
			);
		});

		if (matched.length === 0) {
			const available = new Set(components.map(component => getGroup(component) ?? component.name));
			throw new PageError(
				`No component matches "${rawSelector}". Components: ${[...available].join(', ')}`,
			);
		}

		for (const component of matched) {
			selected.add(component);
		}
	}
	return [...selected];
};
