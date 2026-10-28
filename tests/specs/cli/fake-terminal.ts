import { PassThrough } from 'node:stream';

/** A stream that reports itself as a terminal, recording each write */
export const createFakeTerminal = (isTTY = true) => {
	const writes: string[] = [];
	const stream = Object.assign(new PassThrough(), {
		writes,
		isTTY,
	});
	stream.on('data', (chunk: Buffer) => writes.push(chunk.toString()));
	return stream;
};
