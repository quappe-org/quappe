// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user_id: string;
			locale: import('$lib/paraglide/runtime').Locale;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

// Vite ?raw imports (e.g. the SQL schema inlined at build time).
declare module '*.sql?raw' {
	const content: string;
	export default content;
}

export {};
