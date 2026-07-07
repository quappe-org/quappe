import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DB_PATH = process.env.QUAPPE_DB_PATH ?? resolve(process.cwd(), '.data/quappe.db');
const SCHEMA_PATH = resolve(dirname(fileURLToPath(import.meta.url)), './schema.sql');

let _db: Database.Database | null = null;
const _stmtCache = new Map<string, Database.Statement>();

export function getDb(): Database.Database {
	if (_db) return _db;

	mkdirSync(dirname(DB_PATH), { recursive: true });

	const db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');
	db.pragma('synchronous = NORMAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 5000');

	const schema = readFileSync(SCHEMA_PATH, 'utf-8');
	db.exec(schema);

	_db = db;
	return db;
}

export function prepare<T = unknown>(sql: string): Database.Statement<T[]> {
	const cached = _stmtCache.get(sql);
	if (cached) return cached as Database.Statement<T[]>;
	const stmt = getDb().prepare(sql);
	_stmtCache.set(sql, stmt);
	return stmt as Database.Statement<T[]>;
}

export function withTransaction<T>(fn: () => T): T {
	return getDb().transaction(fn)();
}

export function isDbEmpty(): boolean {
	const row = prepare<{ n: number }>('SELECT COUNT(*) AS n FROM theses').get() as
		| { n: number }
		| undefined;
	return !row || row.n === 0;
}

export function closeDb(): void {
	if (_db) {
		_db.close();
		_db = null;
		_stmtCache.clear();
	}
}
