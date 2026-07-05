import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/reports/pulse');
	if (!res.ok) {
		return { pulse: null, error: `Server antwortete ${res.status}` };
	}
	return { pulse: await res.json(), error: null };
};
