// Standalone stress benchmark - imports the data store directly
// Usage: QUAPPE_SEED_COUNT=100000 node --experimental-strip-types scripts/stress.ts

import {
	seedData,
	getAllTheses,
	getHotTheses,
	getTrendingTheses,
	getTopTheses,
	getHeatMap,
	getArgumentCounts,
	getActivityCalendar,
	tierStats
} from '../src/lib/stores/data.ts';

function bench(label: string, fn: () => unknown, iterations = 1) {
	const times: number[] = [];
	let result: unknown;
	for (let i = 0; i < iterations; i++) {
		const start = process.hrtime.bigint();
		result = fn();
		const end = process.hrtime.bigint();
		times.push(Number(end - start) / 1_000_000);
	}
	const avg = times.reduce((s, t) => s + t, 0) / times.length;
	const min = Math.min(...times);
	const max = Math.max(...times);
	const size = Array.isArray(result) ? result.length : result instanceof Map ? result.size : '-';
	console.log(
		`${label.padEnd(45)} avg=${avg.toFixed(1).padStart(9)}ms  min=${min.toFixed(1).padStart(8)}ms  max=${max.toFixed(1).padStart(8)}ms  result=${size}`
	);
}

console.log(`Seeding ${process.env.QUAPPE_SEED_COUNT ?? '(default)'} theses...`);
const seedStart = process.hrtime.bigint();
seedData();
const seedEnd = process.hrtime.bigint();
const seedMs = Number(seedEnd - seedStart) / 1_000_000;
console.log(`Seed done in ${seedMs.toFixed(0)}ms`);
console.log(`Heap: ${(process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1)}MB`);
console.log(`Tiers:`, tierStats());
console.log();

console.log('=== Benchmarks (5 iterations each) ===');
bench('getAllTheses() [all tiers]', () => getAllTheses(), 5);
bench('getHotTheses() [active only]', () => getHotTheses(), 5);
bench('getTrendingTheses(10)', () => getTrendingTheses(10), 5);
bench('getTrendingTheses(200)', () => getTrendingTheses(200), 5);
bench('getTopTheses(10)', () => getTopTheses(10), 5);
bench('getTopTheses(200)', () => getTopTheses(200), 5);
bench('getArgumentCounts()', () => getArgumentCounts(), 5);
bench('getHeatMap()', () => getHeatMap(), 3);
bench('getActivityCalendar(null, 84)', () => getActivityCalendar(null, 84), 3);

const someTheses = getHotTheses();
if (someTheses.length > 0) {
	const id = someTheses[0].id;
	bench('getActivityCalendar(thesisId, 84)', () => getActivityCalendar(id, 84), 5);
}

console.log();
console.log(`Final heap: ${(process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1)}MB`);
