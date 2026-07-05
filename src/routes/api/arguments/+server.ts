import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArgumentsForThesis, createArgument, setArgumentEmbedding } from '$lib/stores/data';
import { deriveArgumentAttributes } from '$lib/utils/evidence';
import { embed } from '$lib/server/embeddings';

export const GET: RequestHandler = async ({ url }) => {
	const thesis_id = url.searchParams.get('thesis_id');

	if (!thesis_id) {
		return json({ error: 'Missing required query parameter: thesis_id' }, { status: 400 });
	}

	const args = getArgumentsForThesis(thesis_id);
	return json(args);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const {
		thesis_id,
		content,
		stance,
		forked_from_id,
		author_id,
		is_emotional
	}: {
		thesis_id: string;
		content: string;
		stance: 'support' | 'reject';
		forked_from_id?: string;
		author_id?: string;
		is_emotional?: boolean;
	} = body;

	if (!thesis_id || !content) {
		return json({ error: 'Missing required fields: thesis_id, content' }, { status: 400 });
	}

	if (!stance || !['support', 'reject'].includes(stance)) {
		return json({ error: 'Missing or invalid stance. Must be "support" or "reject".' }, { status: 400 });
	}

	const { attributes } = deriveArgumentAttributes(content, Boolean(is_emotional));
	const final_author_id = author_id || crypto.randomUUID();
	const result = createArgument(thesis_id, content, attributes, final_author_id, stance, forked_from_id);

	if ('error' in result) {
		return json({ error: result.error }, { status: 400 });
	}

	// Fire-and-forget embedding for future similarity searches
	embed(content, 'passage')
		.then((vec) => setArgumentEmbedding(result.id, vec))
		.catch(() => {});

	return json(result, { status: 201 });
};
