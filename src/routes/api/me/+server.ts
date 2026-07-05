import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Returns the server-verified user_id for the caller. The hook has already
// set (or minted) the signed cookie by the time this handler runs.
export const GET: RequestHandler = async ({ locals }) => {
	return json({ user_id: locals.user_id });
};
