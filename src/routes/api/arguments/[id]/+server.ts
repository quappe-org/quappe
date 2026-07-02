import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArgumentById, updateArgument, deleteArgument } from '$lib/stores/data';
import { deriveArgumentAttributes } from '$lib/utils/evidence';

export const GET: RequestHandler = async ({ params }) => {
	const arg = getArgumentById(params.id);
	if (!arg) return json({ error: 'Argument not found' }, { status: 404 });
	return json(arg);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const body = await request.json();
	const { content, is_emotional, user_id } = body;

	// If content is updated we re-derive attributes from it.
	let attributes = undefined;
	if (typeof content === 'string') {
		attributes = deriveArgumentAttributes(content, Boolean(is_emotional)).attributes;
	}

	const result = updateArgument(params.id, { content, attributes }, user_id);
	if ('error' in result) {
		return json({ error: result.error }, { status: 403 });
	}
	return json(result);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const ok = deleteArgument(params.id);
	if (!ok) return json({ error: 'Argument not found' }, { status: 404 });
	return json({ ok: true });
};
