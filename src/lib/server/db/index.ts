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

	migrate(db);

	_db = db;
	return db;
}

// Idempotent ALTERs for existing DBs. Fresh installs get these columns via
// CREATE TABLE in schema.sql; older DBs picked up the columns here.
function migrate(db: Database.Database): void {
	const alters = [
		`ALTER TABLE theses    ADD COLUMN hashtags_json TEXT NOT NULL DEFAULT '[]'`,
		`ALTER TABLE arguments ADD COLUMN hashtags_json TEXT`
	];
	for (const sql of alters) {
		try {
			db.exec(sql);
		} catch (e) {
			const msg = (e as Error).message ?? '';
			if (!/duplicate column/i.test(msg)) throw e;
		}
	}
}

export function prepare<T = unknown>(sql: string): Database.Statement<unknown[], T> {
	const cached = _stmtCache.get(sql);
	if (cached) return cached as Database.Statement<unknown[], T>;
	const stmt = getDb().prepare(sql);
	_stmtCache.set(sql, stmt);
	return stmt as Database.Statement<unknown[], T>;
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
