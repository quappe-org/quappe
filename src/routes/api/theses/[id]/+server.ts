import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getThesisById, updateThesis, deleteThesis, computeVoteSummary, setThesisLang } from '$lib/stores/data';
import { checkLength, checkCategories } from '$lib/server/limits';
import { detectLanguage } from '$lib/server/language-detect';

export const GET: RequestHandler = async ({ params }) => {
	const thesis = getThesisById(params.id);

	if (!thesis) {
		return json({ error: 'Thesis not found' }, { status: 404 });
	}

	const voteSummary = computeVoteSummary(thesis.votes);

	return json({ ...thesis, vote_summary: voteSummary });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const body = await request.json();
	const { title, description, categories } = body;

	if (title !== undefined) {
		const err = checkLength('thesis_title', title);
		if (err) return err;
	}
	if (description !== undefined) {
		const err = checkLength('thesis_description', description);
		if (err) return err;
	}
	if (categories !== undefined) {
		const err = checkCategories(categories);
		if (err) return err;
	}

	const result = updateThesis(params.id, { title, description, categories }, locals.user_id);

	if ('error' in result) {
		return json({ error: result.error }, { status: 403 });
	}

	// Re-detect language when title or description changed.
	if (title !== undefined || description !== undefined) {
		detectLanguage(`${result.title} ${result.description}`)
			.then((lang) => setThesisLang(params.id, lang))
			.catch(() => {});
	}

	return json(result);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const existing = getThesisById(params.id);
	if (!existing) return json({ error: 'Thesis not found' }, { status: 404 });
	if (existing.meta.author_id !== locals.user_id) {
		return json({ error: 'Only the author can delete this thesis' }, { status: 403 });
	}

	const deleted = deleteThesis(params.id);
	if (!deleted) return json({ error: 'Thesis not found' }, { status: 404 });
	return json({ success: true }, { status: 200 });
};
