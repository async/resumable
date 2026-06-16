import { normalize } from 'pathe';
import { parsePath } from 'ufo';
import type { ResumableEnvironment } from './types.ts';

export function createResumableDevGraph() {
	const parentModules = new Map<string, Set<string>>();

	return {
		record(parent: string, ids: Iterable<string>, environment: ResumableEnvironment) {
			const entries = [...ids];
			for (const path of parentKeys(parent)) {
				const key = parentKey(environment, path);
				const existing = parentModules.get(key) ?? new Set<string>();
				for (const id of entries) {
					existing.add(id);
				}
				parentModules.set(key, existing);
			}
		},
		clear(parent: string, environment?: ResumableEnvironment) {
			const deleted: string[] = [];
			for (const currentEnvironment of targetEnvironments(environment)) {
				for (const path of parentKeys(parent)) {
					const key = parentKey(currentEnvironment, path);
					const ids = parentModules.get(key);
					if (!ids) continue;
					deleted.push(...ids);
					parentModules.delete(key);
				}
			}
			return [...new Set(deleted)];
		},
		reset() {
			parentModules.clear();
		},
	};
}

function targetEnvironments(environment: ResumableEnvironment | undefined) {
	if (environment) {
		return [environment];
	}

	return allEnvironments;
}

const allEnvironments: readonly ResumableEnvironment[] = ['client', 'server', 'lib'];

function parentKeys(parent: string) {
	const path = pathname(parent);
	const normalized = normalize(path);
	let withLeadingSlash = normalized;
	if (!withLeadingSlash.startsWith('/')) {
		withLeadingSlash = `/${withLeadingSlash}`;
	}
	const barePath = withLeadingSlash.slice(1);
	return new Set([path, normalized, withLeadingSlash, barePath]);
}

function parentKey(environment: ResumableEnvironment, parent: string) {
	return `${environment}:${parent}`;
}

function pathname(id: string) {
	return parsePath(id).pathname;
}
