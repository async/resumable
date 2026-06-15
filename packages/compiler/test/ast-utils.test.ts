import { expect, test } from 'vitest';
import { asNodes, walkNode, type AnyNode } from '../src/ast/nodes.ts';
import { expressionSource, sourceSpan } from '../src/ast/source.ts';

test('AST helpers expose raw traversal and source-span utilities', () => {
	const source = 'count + menu.title';
	const ast = {
		type: 'BinaryExpression',
		start: 0,
		end: source.length,
		left: {
			type: 'Identifier',
			start: 0,
			end: 5,
			name: 'count',
		},
		right: {
			type: 'MemberExpression',
			start: 8,
			end: source.length,
			object: {
				type: 'Identifier',
				start: 8,
				end: 12,
				name: 'menu',
			},
			property: {
				type: 'Identifier',
				start: 13,
				end: source.length,
				name: 'title',
			},
		},
	} satisfies AnyNode;
	const visited: string[] = [];

	walkNode(ast, (node) => {
		if (node.type) visited.push(node.type);
	});

	expect(asNodes([ast.left, null, ast.right]).map((node) => node.type)).toEqual([
		'Identifier',
		'MemberExpression',
	]);
	expect(visited).toEqual([
		'BinaryExpression',
		'Identifier',
		'MemberExpression',
		'Identifier',
		'Identifier',
	]);
	expect(expressionSource(ast.right, source)).toBe('menu.title');
	expect(sourceSpan(ast.left, 'src/App.tsrx')).toEqual({
		filename: 'src/App.tsrx',
		start: 0,
		end: 5,
	});
});
