type Stream = NodeJS.WritableStream & {
	isTTY?: boolean;
};

const csi = '\u001B[';
const hideCursor = `${csi}?25l`;
const showCursor = `${csi}?25h`;

// With autowrap off, the terminal cuts long lines at the edge, so each line takes one row
const disableWrap = `${csi}?7l`;
const enableWrap = `${csi}?7h`;
const hide = `${hideCursor}${disableWrap}`;
const restore = `${showCursor}${enableWrap}`;

// Synchronized output: supporting terminals paint the whole frame at once, others ignore it
const beginFrame = `${csi}?2026h`;
const endFrame = `${csi}?2026l`;

/**
 * A block of lines at the bottom of a terminal that each render replaces.
 * Returns `undefined` when the stream is not a terminal.
 *
 * While anything is drawn, the cursor is hidden and autowrap is off. `clear()` erases the block
 * and restores both, and so do Ctrl-C (which exits with 130) and process exit.
 */
export const createLiveRegion = (stream: Stream) => {
	if (!stream.isTTY) {
		return;
	}

	let height = 0;
	let drawing = false;

	// Moving up from the line below the block, then clearing to the end, erases it
	const erase = () => (height > 0 ? `${csi}${height}A${csi}0J` : '');

	const restoreTerminal = () => {
		stream.write(restore);
	};

	const clear = () => {
		if (!drawing) {
			return;
		}
		stream.write(`${erase()}${restore}`);
		height = 0;
		drawing = false;
		process.off('exit', restoreTerminal);
		process.off('SIGINT', onInterrupt);
	};

	const onInterrupt = () => {
		clear();
		process.exit(130);
	};

	return {
		render: (lines: string[]) => {
			if (!drawing) {
				drawing = true;
				process.on('exit', restoreTerminal);
				process.once('SIGINT', onInterrupt);
			}

			const frame = lines.map(line => `${line}\n`).join('');

			// One write per frame, so the terminal never shows a half-drawn block
			stream.write(`${beginFrame}${hide}${erase()}${frame}${endFrame}`);
			height = lines.length;
		},
		clear,
	};
};
