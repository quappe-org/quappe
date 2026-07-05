import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArgumentById, updateArgument, deleteArgument } from '$lib/stores/data';
import { deriveArgumentAttributes } from '$lib/utils/evidence';
import { checkLength } from '$lib/server/limits';

export const GET: RequestHandler = async ({ params }) => {
	const arg = getArgumentById(params.id);
	if (!arg) return json({ error: 'Argument not found' }, { status: 404 });
	return json(arg);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const body = await request.json();
	const { content, is_emotional } = body;

	// If content is updated we re-derive attributes from it.
	let attributes = undefined;
	if (typeof content === 'string') {
		const err = checkLength('argument_content', content);
		if (err) return err;
		attributes = deriveArgumentAttributes(content, Boolean(is_emotional)).attributes;
	}

	const result = updateArgument(params.id, { content, attributes }, locals.user_id);
	if ('error' in result) {
		return json({ error: result.error }, { status: 403 });
	}
	return json(result);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const existing = getArgumentById(params.id);
	if (!existing) return json({ error: 'Argument not found' }, { status: 404 });
	if (existing.meta.author_id !== locals.user_id) {
		return json({ error: 'Only the author can delete this argument' }, { status: 403 });
	}
	const ok = deleteArgument(params.id);
	if (!ok) return json({ error: 'Argument not found' }, { status: 404 });
	return json({ ok: true });
};
