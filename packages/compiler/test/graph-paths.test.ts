import { expect, test } from 'vitest';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../src/artifact-helpers/graph-paths.ts';
import type { SemanticGraphArtifact } from '../src/artifacts.ts';

const graph = {
	aliases: [
		{
			name: 'menuTitle',
			target: 'menu.title',
			declarationKind: 'const',
		},
		{
			name: 'menuRest',
			target: 'menu',
			excludedPaths: [['title']],
			declarationKind: 'const',
		},
	],
	graphBindings: [
		{
			id: 'state:menu',
			name: 'menu',
			kind: 'state',
			writable: true,
		},
	],
} satisfies Pick<SemanticGraphArtifact, 'aliases' | 'graphBindings'>;

test('graph path helpers resolve bindings, aliases, and rest exclusions', () => {
	const bindings = graphBindingMap(graph);
	const aliases = semanticAliasMap(graph);

	expect(resolveGraphPath('menu.title', bindings, aliases)).toEqual({
		binding: expect.objectContaining({ id: 'state:menu' }),
		path: ['title'],
	});
	expect(resolveGraphPath('menuTitle', bindings, aliases)).toEqual({
		binding: expect.objectContaining({ id: 'state:menu' }),
		path: ['title'],
	});
	expect(resolveGraphPath('menuRest.meta.label', bindings, aliases)).toEqual({
		binding: expect.objectContaining({ id: 'state:menu' }),
		path: ['meta', 'label'],
	});
	expect(resolveGraphPath('menuRest.title', bindings, aliases)).toBeNull();
});

test('graph path helpers split JavaScript member paths, not filesystem paths', () => {
	expect(splitStaticGraphPath(' menu.title ')).toEqual(['menu', 'title']);
	expect(splitStaticGraphPath("menu['meta'].items[0].label")).toEqual([
		'menu',
		'meta',
		'items',
		'0',
		'label',
	]);
});
