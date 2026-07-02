// Global categories store - editable by admin
// In MVP, everyone is admin

import type { Category } from '$lib/models/types';
import { DEFAULT_CATEGORIES } from '$lib/models/types';

let _categories = $state<Category[]>([...DEFAULT_CATEGORIES]);

export const categoriesStore = {
	get list(): Category[] {
		return _categories;
	},
	add(cat: Category) {
		const normalized = cat.trim().toLowerCase();
		if (normalized && !_categories.includes(normalized)) {
			_categories = [..._categories, normalized];
		}
	},
	remove(cat: Category) {
		_categories = _categories.filter((c) => c !== cat);
	},
	set(cats: Category[]) {
		_categories = cats;
	},
	reset() {
		_categories = [...DEFAULT_CATEGORIES];
	}
};
