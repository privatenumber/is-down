import { inspect, styleText } from 'node:util';
import { cli, CleyeExit } from 'cleye';
import { Integer } from 'cleye/formats';
import packageJson from '../../package.json' with { type: 'json' };
import { getStatus } from '../status/get-status.ts';
import { defaultProviders } from './catalog.ts';
import { formatResults } from './format.ts';
import { parseDuration } from './duration.ts';
import { trackProgress } from './progress.ts';
import { resolveTargets, TargetError } from './resolve.ts';

try {
	const argv = cli({
		name: 'is-down',
		version: packageJson.version,
		parameters: ['[services...]'],
		commands: {
			list: {
				description: 'List known services, optionally filtered by a query',
				loader: () => import('./commands/list.ts'),
			},
			skills: {
				description: 'Print the bundled agent skill, or install it with --install <directory>',
				loader: () => import('./commands/skills.ts'),
			},
		},
		flags: {
			json: {
				type: Boolean,
				description: 'Output results as JSON',
			},
			since: {
				type: parseDuration,
				description: 'Also show incidents resolved within this window (e.g. 30m, 6h, 2d). 0 disables',
				placeholder: '<duration>',
				default: {
					value: () => 60 * 60 * 1000,
					description: '1h',
				},
			},
			timeout: {
				type: Integer,
				description: 'Request timeout per status page in milliseconds',
				placeholder: '<ms>',
				default: 5000,
			},
		},
		strictFlags: true,
		throwOnExit: true,
		help: {
			description: [
				'Check whether developer services are down using their official status pages.',
				'',
				'Services can be catalog IDs, service:component selectors, or status page URLs.',
				`"defaults" expands to the default services: ${defaultProviders.map(provider => provider.id).join(', ')}`,
				'',
				'Exit codes: 0 operational, 1 degraded, 2 status page unreachable or invalid input',
			].join('\n'),
			examples: [
				'is-down',
				'is-down defaults discord',
				'is-down npm:install github:git github:actions',
				'is-down https://registry.npmjs.org/react',
				'is-down "https://status.example.com#builds" --since 6h',
				'is-down --json vercel',
				'is-down list google',
				'is-down skills --install ~/.agents/skills',
			],
		},
	});

	if (argv.command) {
		await argv.runCommand();
	} else {
		const targets = argv._.services.length > 0 ? argv._.services : ['defaults'];
		const pages = resolveTargets(targets);

		// In a terminal, each result prints as soon as it arrives. Elsewhere, results print
		// together in argument order, so the output is the same on every run.
		const printEach = process.stdout.isTTY && !argv.flags.json;
		const results = await trackProgress(
			pages.map(page => page.provider?.name ?? new URL(page.url).hostname),
			pages.map(page => getStatus(page.provider ?? page.url, {
				components: page.selectors,
				incidents: page.incidentIds,
				since: argv.flags.since,
				signal: AbortSignal.timeout(argv.flags.timeout),
			})),
			{
				onResult: printEach
					? (result) => {
						process.stdout.write(`${formatResults([result])}\n`);
					}
					: undefined,
			},
		);

		if (!printEach) {
			process.stdout.write(`${argv.flags.json ? JSON.stringify(results, null, '\t') : formatResults(results)}\n`);
		}

		if (results.some(result => result.state === 'degraded')) {
			process.exitCode = 1;
		} else if (results.some(result => result.state === 'error')) {
			process.exitCode = 2;
		}
	}
} catch (error) {
	// Invalid input exits 2, because exit code 1 means "degraded". cleye reports its own errors.
	if (error instanceof CleyeExit) {
		process.exitCode = error.code === 0 ? 0 : 2;
	} else if (error instanceof TargetError) {
		const lines = [`${styleText('red', 'Error:', { stream: process.stderr })} ${error.message}`];
		if (error.hints.length > 0) {
			lines.push('', ...error.hints);
		}
		process.stderr.write(`${lines.join('\n')}\n`);
		process.exitCode = 2;
	} else {
		// An uncaught error would exit 1, which reports a bug as an outage
		process.stderr.write(`${inspect(error)}\n`);
		process.exitCode = 2;
	}
}
