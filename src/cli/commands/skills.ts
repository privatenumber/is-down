import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from 'cleye';

const argv = cli({
	name: 'skills',
	flags: {
		install: {
			type: String,
			description: 'Copy the skill into <directory>/is-down instead of printing it',
			placeholder: '<directory>',
		},
	},
	help: {
		description: 'Print the agent skill bundled with is-down, or install it into an agent skills directory.',
		examples: [
			'is-down skills',
			'is-down skills --install ~/.agents/skills',
			'is-down skills --install ~/.claude/skills',
			'is-down skills --install .agents/skills',
		],
	},
});

// The command is bundled into a chunk at a different depth than its source file, so search upward
const findSkillDirectory = async () => {
	let directory = path.dirname(fileURLToPath(import.meta.url));
	while (true) {
		const skillDirectory = path.join(directory, 'skills', 'is-down');
		try {
			await fs.access(path.join(skillDirectory, 'SKILL.md'));
			return skillDirectory;
		} catch {
			// Not in this directory; keep searching upward
		}

		const parent = path.dirname(directory);
		if (parent === directory) {
			throw new Error('Could not find the bundled is-down skill');
		}
		directory = parent;
	}
};

const skillDirectory = await findSkillDirectory();

if (argv.flags.install === undefined) {
	process.stdout.write(await fs.readFile(path.join(skillDirectory, 'SKILL.md'), 'utf8'));
} else {
	// Shells don't expand ~ in --install=~/..., so expand it here
	const directory = argv.flags.install.replace(/^~(?=$|[/\\])/, os.homedir());
	const destination = path.resolve(directory, 'is-down');
	await fs.cp(skillDirectory, destination, { recursive: true });
	process.stderr.write(`Installed the is-down skill to ${destination}\n`);
}
