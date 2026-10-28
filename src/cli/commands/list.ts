import { styleText } from 'node:util';
import { cli } from 'cleye';
import { providers, searchProviders } from '../catalog.ts';
import { linkTo } from '../format.ts';

const argv = cli({
	name: 'list',
	parameters: ['[query]'],
	flags: {
		json: {
			type: Boolean,
			description: 'Output the matching catalog entries as JSON, keyed by ID',
		},
	},
	help: {
		description: 'List known services. The query matches the start of words in IDs, names, aliases, and domains.',
		examples: [
			'is-down list',
			'is-down list google',
			'is-down list npmjs.com',
		],
	},
});

const style = (format: Parameters<typeof styleText>[0], text: string) => (
	styleText(format, text, { stream: process.stdout })
);

const { query } = argv._;
const entries = query ? searchProviders(query) : providers;

if (entries.length === 0) {
	process.exitCode = 2;
}

if (argv.flags.json) {
	const keyed = Object.fromEntries(entries.map(({ id, ...provider }) => [id, provider]));
	process.stdout.write(`${JSON.stringify(keyed, null, '\t')}\n`);
} else if (entries.length === 0) {
	process.stderr.write(`No services match "${query}"\n`);
} else {
	// IDs and aliases are what the CLI accepts. Names are left out since they almost always match.
	const rows = entries.map(entry => ({
		service: [entry.id, ...(entry.aliases ?? [])].join(', '),
		entry,
	}));
	const header = 'SERVICE';
	const width = Math.max(header.length, ...rows.map(row => row.service.length));

	// Every catalog URL is https, so the scheme is left out
	const lines = rows.map(({ service, entry }) => {
		const page = linkTo(entry.url, entry.url.replace(/^https:\/\//, ''));
		const note = entry.platform === 'other' ? `  ${style('dim', '(not checkable)')}` : '';
		return `${service.padEnd(width)}  ${page}${note}`;
	});
	const count = query
		? `${entries.length} of ${providers.length} services match "${query}".`
		: `${providers.length} services.`;
	process.stdout.write(`${[
		style('bold', `${header.padEnd(width)}  STATUS PAGE`),
		...lines,
		'',
		style('dim', `${count} Check one with: is-down <service>`),
	].join('\n')}\n`);
}
