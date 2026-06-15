import { expect, test } from 'vitest';
import type { AnyNode } from '../src/ast/nodes.ts';
import {
	collectAssignment,
	collectCollectionCall,
	collectDelete,
	collectExpressionReads,
	collectUpdate,
} from '../src/passes/semantic-graph/collect-expressions.ts';
import {
	createMutableSemanticGraphArtifact,
	createWalkState,
} from '../src/passes/semantic-graph/types.ts';

test('expression collector records graph reads and write targets', () => {
	const source =
		'count += increment;items.push(nextItem);cache.set(nextKey, nextValue);selected.add(nextItem);delete menu.open;menu.open;count++';
	const countStart = source.indexOf('count');
	const incrementStart = source.indexOf('increment');
	const itemsStart = source.indexOf('items');
	const nextItemStart = source.indexOf('nextItem');
	const cacheStart = source.indexOf('cache');
	const nextKeyStart = source.indexOf('nextKey');
	const nextValueStart = source.indexOf('nextValue');
	const selectedStart = source.indexOf('selected');
	const selectedNextItemStart = source.lastIndexOf('nextItem');
	const deleteMenuOpenStart = source.indexOf('menu.open');
	const menuOpenStart = source.indexOf('menu.open', deleteMenuOpenStart + 'menu.open'.length);
	const updateStart = source.lastIndexOf('count');
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	const state = createWalkState({
		filename: 'src/App.tsrx',
		source,
		graph,
	});
	const assignment = {
		type: 'AssignmentExpression',
		operator: '+=',
		left: {
			type: 'Identifier',
			start: countStart,
			end: countStart + 'count'.length,
		},
		right: {
			type: 'Identifier',
			start: incrementStart,
			end: incrementStart + 'increment'.length,
		},
	} satisfies AnyNode;
	const collectionCall = {
		type: 'CallExpression',
		callee: {
			type: 'MemberExpression',
			object: {
				type: 'Identifier',
				start: itemsStart,
				end: itemsStart + 'items'.length,
			},
			property: {
				type: 'Identifier',
				name: 'push',
			},
		},
		arguments: [
			{
				type: 'Identifier',
				start: nextItemStart,
				end: nextItemStart + 'nextItem'.length,
			},
		],
	} satisfies AnyNode;
	const mapCollectionCall = {
		type: 'CallExpression',
		callee: {
			type: 'MemberExpression',
			object: {
				type: 'Identifier',
				start: cacheStart,
				end: cacheStart + 'cache'.length,
			},
			property: {
				type: 'Identifier',
				name: 'set',
			},
		},
		arguments: [
			{
				type: 'Identifier',
				start: nextKeyStart,
				end: nextKeyStart + 'nextKey'.length,
			},
			{
				type: 'Identifier',
				start: nextValueStart,
				end: nextValueStart + 'nextValue'.length,
			},
		],
	} satisfies AnyNode;
	const setCollectionCall = {
		type: 'CallExpression',
		callee: {
			type: 'MemberExpression',
			object: {
				type: 'Identifier',
				start: selectedStart,
				end: selectedStart + 'selected'.length,
			},
			property: {
				type: 'Identifier',
				name: 'add',
			},
		},
		arguments: [
			{
				type: 'Identifier',
				start: selectedNextItemStart,
				end: selectedNextItemStart + 'nextItem'.length,
			},
		],
	} satisfies AnyNode;
	const menuRead = {
		type: 'MemberExpression',
		start: menuOpenStart,
		end: menuOpenStart + 'menu.open'.length,
		object: { type: 'Identifier', name: 'menu' },
		property: { type: 'Identifier', name: 'open' },
	} satisfies AnyNode;
	const deleteMenuOpen = {
		type: 'UnaryExpression',
		operator: 'delete',
		argument: {
			type: 'MemberExpression',
			start: deleteMenuOpenStart,
			end: deleteMenuOpenStart + 'menu.open'.length,
			object: { type: 'Identifier', name: 'menu' },
			property: { type: 'Identifier', name: 'open' },
		},
	} satisfies AnyNode;
	const update = {
		type: 'UpdateExpression',
		argument: {
			type: 'Identifier',
			start: updateStart,
			end: updateStart + 'count'.length,
		},
	} satisfies AnyNode;

	collectAssignment(assignment, state);
	collectExpressionReads(assignment, state);
	collectCollectionCall(collectionCall, state);
	collectExpressionReads(collectionCall, state);
	collectCollectionCall(mapCollectionCall, state);
	collectExpressionReads(mapCollectionCall, state);
	collectCollectionCall(setCollectionCall, state);
	collectExpressionReads(setCollectionCall, state);
	collectDelete(deleteMenuOpen, state);
	collectExpressionReads(deleteMenuOpen, state);
	collectExpressionReads(menuRead, state);
	collectUpdate(update, state);

	expect(graph.stateWrites).toEqual([
		expect.objectContaining({
			target: 'count',
			operation: 'assign',
			assignmentOperator: '+=',
		}),
		expect.objectContaining({
			target: 'items',
			operation: 'call',
			method: 'push',
			argumentSources: ['nextItem'],
		}),
		expect.objectContaining({
			target: 'cache',
			operation: 'call',
			method: 'set',
			argumentSources: ['nextKey', 'nextValue'],
		}),
		expect.objectContaining({
			target: 'selected',
			operation: 'call',
			method: 'add',
			argumentSources: ['nextItem'],
		}),
		expect.objectContaining({
			target: 'menu.open',
			operation: 'delete',
		}),
		expect.objectContaining({
			target: 'count',
			operation: 'update',
		}),
	]);
	expect(graph.stateReads).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ source: 'count' }),
			expect.objectContaining({ source: 'increment' }),
			expect.objectContaining({ source: 'items' }),
			expect.objectContaining({ source: 'nextItem' }),
			expect.objectContaining({ source: 'cache' }),
			expect.objectContaining({ source: 'nextKey' }),
			expect.objectContaining({ source: 'nextValue' }),
			expect.objectContaining({ source: 'selected' }),
			expect.objectContaining({ source: 'menu.open' }),
		]),
	);
	expect(graph.stateReads).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ source: 'cache.set' })]),
	);
	expect(graph.stateReads).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ source: 'selected.add' })]),
	);
	expect(graph.stateReads.filter((read) => read.source === 'menu.open')).toHaveLength(1);
});

test('expression collector records update expression operator and prefix semantics', () => {
	const source = 'count++;--total';
	const countStart = source.indexOf('count');
	const totalStart = source.indexOf('total');
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	const state = createWalkState({
		filename: 'src/App.tsrx',
		source,
		graph,
	});

	collectUpdate(
		{
			type: 'UpdateExpression',
			operator: '++',
			prefix: false,
			argument: {
				type: 'Identifier',
				start: countStart,
				end: countStart + 'count'.length,
			},
		},
		state,
	);
	collectUpdate(
		{
			type: 'UpdateExpression',
			operator: '--',
			prefix: true,
			argument: {
				type: 'Identifier',
				start: totalStart,
				end: totalStart + 'total'.length,
			},
		},
		state,
	);

	expect(graph.stateWrites).toEqual([
		expect.objectContaining({
			target: 'count',
			operation: 'update',
			updateOperator: '++',
			prefix: false,
		}),
		expect.objectContaining({
			target: 'total',
			operation: 'update',
			updateOperator: '--',
			prefix: true,
		}),
	]);
});

test('expression collector does not lower dynamic computed collection methods', () => {
	const source = 'items[push](nextItem)';
	const itemsStart = source.indexOf('items');
	const pushStart = source.indexOf('push');
	const nextItemStart = source.indexOf('nextItem');
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	const state = createWalkState({
		filename: 'src/App.tsrx',
		source,
		graph,
	});
	const dynamicMethodCall = {
		type: 'CallExpression',
		callee: {
			type: 'MemberExpression',
			computed: true,
			start: itemsStart,
			end: source.indexOf('('),
			object: {
				type: 'Identifier',
				start: itemsStart,
				end: itemsStart + 'items'.length,
			},
			property: {
				type: 'Identifier',
				name: 'push',
				start: pushStart,
				end: pushStart + 'push'.length,
			},
		},
		arguments: [
			{
				type: 'Identifier',
				start: nextItemStart,
				end: nextItemStart + 'nextItem'.length,
			},
		],
	} satisfies AnyNode;

	collectCollectionCall(dynamicMethodCall, state);
	collectExpressionReads(dynamicMethodCall, state);

	expect(graph.stateWrites).toEqual([]);
	expect(graph.stateReads).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ source: 'items[push]' }),
			expect.objectContaining({ source: 'push' }),
			expect.objectContaining({ source: 'nextItem' }),
		]),
	);
});

test('expression collector lowers static computed collection method literals', () => {
	const source = "items['push'](nextItem)";
	const itemsStart = source.indexOf('items');
	const pushStart = source.indexOf("'push'");
	const nextItemStart = source.indexOf('nextItem');
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	const state = createWalkState({
		filename: 'src/App.tsrx',
		source,
		graph,
	});
	const staticMethodCall = {
		type: 'CallExpression',
		callee: {
			type: 'MemberExpression',
			computed: true,
			start: itemsStart,
			end: source.indexOf('('),
			object: {
				type: 'Identifier',
				start: itemsStart,
				end: itemsStart + 'items'.length,
			},
			property: {
				type: 'Literal',
				value: 'push',
				start: pushStart,
				end: pushStart + "'push'".length,
			},
		},
		arguments: [
			{
				type: 'Identifier',
				start: nextItemStart,
				end: nextItemStart + 'nextItem'.length,
			},
		],
	} satisfies AnyNode;

	collectCollectionCall(staticMethodCall, state);
	collectExpressionReads(staticMethodCall, state);

	expect(graph.stateWrites).toEqual([
		expect.objectContaining({
			target: 'items',
			operation: 'call',
			method: 'push',
			argumentSources: ['nextItem'],
		}),
	]);
	expect(graph.stateReads).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ source: 'items' }),
			expect.objectContaining({ source: 'nextItem' }),
		]),
	);
	expect(graph.stateReads).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ source: "items['push']" })]),
	);
});

test('expression collector marks optional collection calls', () => {
	const source = 'items?.push(nextItem)';
	const itemsStart = source.indexOf('items');
	const nextItemStart = source.indexOf('nextItem');
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	const state = createWalkState({
		filename: 'src/App.tsrx',
		source,
		graph,
	});
	const optionalCall = {
		type: 'CallExpression',
		callee: {
			type: 'MemberExpression',
			optional: true,
			object: {
				type: 'Identifier',
				start: itemsStart,
				end: itemsStart + 'items'.length,
			},
			property: {
				type: 'Identifier',
				name: 'push',
			},
		},
		arguments: [
			{
				type: 'Identifier',
				start: nextItemStart,
				end: nextItemStart + 'nextItem'.length,
			},
		],
	} satisfies AnyNode;

	collectCollectionCall(optionalCall, state);
	collectExpressionReads(optionalCall, state);

	expect(graph.stateWrites).toEqual([
		expect.objectContaining({
			target: 'items',
			operation: 'call',
			method: 'push',
			argumentSources: ['nextItem'],
			optional: true,
		}),
	]);
	expect(graph.stateReads).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ source: 'items' }),
			expect.objectContaining({ source: 'nextItem' }),
		]),
	);
});

test('expression collector marks optional delete writes', () => {
	const source = 'delete menu?.open';
	const menuStart = source.indexOf('menu');
	const graph = createMutableSemanticGraphArtifact('src/App.tsrx');
	const state = createWalkState({
		filename: 'src/App.tsrx',
		source,
		graph,
	});
	const optionalDelete = {
		type: 'UnaryExpression',
		operator: 'delete',
		argument: {
			type: 'MemberExpression',
			optional: true,
			start: menuStart,
			end: menuStart + 'menu?.open'.length,
			object: { type: 'Identifier', name: 'menu' },
			property: { type: 'Identifier', name: 'open' },
		},
	} satisfies AnyNode;

	collectDelete(optionalDelete, state);
	collectExpressionReads(optionalDelete, state);

	expect(graph.stateWrites).toEqual([
		expect.objectContaining({
			target: 'menu?.open',
			operation: 'delete',
			optional: true,
		}),
	]);
	expect(graph.stateReads).toEqual([]);
});
