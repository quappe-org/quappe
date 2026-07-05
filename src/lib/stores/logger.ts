// In-memory ring buffer logger. Not for production - for the hidden admin console.
// Hot-path safe: constant-time push, no allocation churn beyond the entry itself.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogSource = 'store' | 'api' | 'lifecycle' | 'cache' | 'seed' | 'system' | 'llm';

export interface LogEntry {
	seq: number;
	ts: number; // ms epoch
	level: LogLevel;
	source: LogSource;
	message: string;
	meta?: Record<string, unknown>;
}

const BUFFER_SIZE = 2000; // last N entries kept
const buffer: (LogEntry | undefined)[] = new Array(BUFFER_SIZE);
let head = 0; // next write index
let seq = 0; // strictly increasing entry id
let mirrorToConsole = true;

function push(level: LogLevel, source: LogSource, message: string, meta?: Record<string, unknown>) {
	const entry: LogEntry = {
		seq: ++seq,
		ts: Date.now(),
		level,
		source,
		message,
		meta
	};
	buffer[head] = entry;
	head = (head + 1) % BUFFER_SIZE;
	if (mirrorToConsole) {
		const line = `[${source}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`;
		if (level === 'error') console.error(line);
		else if (level === 'warn') console.warn(line);
		else if (level === 'debug') console.debug(line);
		else console.log(line);
	}
}

export const logger = {
	debug(source: LogSource, message: string, meta?: Record<string, unknown>) {
		push('debug', source, message, meta);
	},
	info(source: LogSource, message: string, meta?: Record<string, unknown>) {
		push('info', source, message, meta);
	},
	warn(source: LogSource, message: string, meta?: Record<string, unknown>) {
		push('warn', source, message, meta);
	},
	error(source: LogSource, message: string, meta?: Record<string, unknown>) {
		push('error', source, message, meta);
	},
	setConsoleMirror(enabled: boolean) {
		mirrorToConsole = enabled;
	}
};

/** Return the last N entries in chronological order (oldest to newest). */
export function tailLogs(limit = 200, sinceSeq = 0): LogEntry[] {
	const out: LogEntry[] = [];
	// Walk backwards from head (which points to the next write slot)
	const count = Math.min(limit, BUFFER_SIZE);
	for (let i = 1; i <= count; i++) {
		const idx = (head - i + BUFFER_SIZE) % BUFFER_SIZE;
		const e = buffer[idx];
		if (!e) break;
		if (e.seq <= sinceSeq) break;
		out.push(e);
	}
	// out is newest-first; reverse to chronological order
	out.reverse();
	return out;
}

/** For the admin UI to know how many entries exist without pulling them. */
export function logStats(): { total: number; buffered: number; capacity: number } {
	let buffered = 0;
	for (const e of buffer) if (e) buffered++;
	return { total: seq, buffered, capacity: BUFFER_SIZE };
}

/** Wipe the buffer (admin action). */
export function clearLogs(): void {
	for (let i = 0; i < buffer.length; i++) buffer[i] = undefined;
	head = 0;
	// seq is intentionally NOT reset so old refs are never mistaken for new entries
}
