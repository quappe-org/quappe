import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveThesis } from '$lib/stores/data';

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json().catch(() => ({}));
	const archived = body.archived !== false; // default: archive
	const updated = archiveThesis(params.id, archived);
	if (!updated) return json({ error: 'Thesis not found' }, { status: 404 });
	return json(updated);
};
