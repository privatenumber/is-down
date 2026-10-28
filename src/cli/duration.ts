const units = {
	s: 1000,
	m: 60 * 1000,
	h: 60 * 60 * 1000,
	d: 24 * 60 * 60 * 1000,
};

/** Parses durations like `30m`, `6h`, `2d`, or `1h30m` into milliseconds */
export const parseDuration = (value: string) => {
	if (value === '0') {
		return 0;
	}

	const parts = [...value.matchAll(/(\d+)([smhd])/g)];
	if (parts.length === 0 || parts.map(part => part[0]).join('') !== value) {
		throw new Error(`Invalid duration "${value}". Use a format like 30m, 6h, 2d, or 0`);
	}
	let total = 0;
	for (const [, amount, unit] of parts) {
		total += Number(amount) * units[unit as keyof typeof units];
	}
	return total;
};

export const formatDuration = (milliseconds: number) => {
	const minutes = Math.floor(milliseconds / units.m);
	if (minutes < 1) {
		return '<1m';
	}

	const days = Math.floor(minutes / (24 * 60));
	const hours = Math.floor(minutes / 60) % 24;
	const remainingMinutes = minutes % 60;
	if (days > 0) {
		return hours > 0 ? `${days}d${hours}h` : `${days}d`;
	}
	if (hours > 0) {
		return remainingMinutes > 0 ? `${hours}h${remainingMinutes}m` : `${hours}h`;
	}
	return `${remainingMinutes}m`;
};
