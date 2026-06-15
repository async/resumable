import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { buildSemanticGraph, planPayloadLocators } from '../src/index.ts';

test('payload-locators fixture plans async view locator arena records', async () => {
	const fixturePath = 'fixtures/proofs/payload-locators/src/App.tsrx';
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');
	const graph = await buildSemanticGraph({
		filename: fixturePath,
		source,
	});

	const artifact = planPayloadLocators(graph);

	expect(artifact.passId).toBe('payload-locator-planning');
	expect(artifact.filename).toBe(fixturePath);
	expect(artifact.locatorStrategy).toEqual({
		mode: 'dom-order-tree-walker',
		requiresPerNodeAttributes: false,
		usesVdom: false,
	});
	expect(artifact.staticHostNodeIds).toEqual(expect.arrayContaining(['h7', 'h8', 'h9']));
	expect(artifact.dynamicHostNodeIds).toEqual(
		expect.arrayContaining(['h2', 'h5', 'h10', 'h17', 'h22', 'h25']),
	);
	expect(artifact.dynamicHostNodeIds).not.toEqual(expect.arrayContaining(['h7', 'h8', 'h9']));
	expect(artifact.locatorStream).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'element',
				hostNodeId: 'h2',
				owns: expect.arrayContaining(['text-binding']),
			}),
			expect.objectContaining({
				kind: 'element',
				hostNodeId: 'h5',
				owns: expect.arrayContaining(['event', 'behavior', 'element-handle']),
			}),
			expect.objectContaining({
				kind: 'comment',
				anchorKind: 'branch',
				ownerId: 'branch0',
				firstHostNodeId: 'h10',
			}),
			expect.objectContaining({
				kind: 'comment',
				anchorKind: 'keyed-list',
				ownerId: 'loop0',
				firstHostNodeId: 'h16',
			}),
			expect.objectContaining({
				kind: 'comment',
				anchorKind: 'empty-fallback',
				ownerId: 'empty0',
				firstHostNodeId: 'h21',
			}),
			expect.objectContaining({
				kind: 'skip',
				count: 3,
			}),
		]),
	);
	expect(artifact.branchAnchorRecords).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: 'branch0',
				condition: 'view.open',
				locator: expect.objectContaining({
					kind: 'comment',
					anchorKind: 'branch',
					firstHostNodeId: 'h10',
				}),
			}),
		]),
	);
	expect(artifact.keyedListRecords).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: 'loop0',
				iterable: 'visibleItems',
				itemName: 'item',
				indexName: 'index',
				key: 'item.id',
				locator: expect.objectContaining({
					kind: 'comment',
					anchorKind: 'keyed-list',
					firstHostNodeId: 'h16',
				}),
			}),
		]),
	);
	expect(artifact.emptyFallbackRecords).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				id: 'empty0',
				locator: expect.objectContaining({
					kind: 'comment',
					anchorKind: 'empty-fallback',
					firstHostNodeId: 'h21',
				}),
			}),
		]),
	);
	expect(artifact.behaviorHostRecords).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ hostNodeId: 'h5' }),
			expect.objectContaining({ hostNodeId: 'h10' }),
			expect.objectContaining({ hostNodeId: 'h17' }),
		]),
	);
	expect(artifact.elementHandleRecords).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				handleName: 'filterInput',
				locator: expect.objectContaining({ kind: 'element', hostNodeId: 'h5' }),
			}),
			expect.objectContaining({
				handleName: 'detailsPanel',
				locator: expect.objectContaining({ kind: 'element', hostNodeId: 'h10' }),
			}),
		]),
	);
	expect(artifact.textBindingRecords).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				source: 'summary',
				locator: expect.objectContaining({ kind: 'element', hostNodeId: 'h2' }),
			}),
			expect.objectContaining({
				source: 'view.filter',
				locator: expect.objectContaining({ kind: 'element', hostNodeId: 'h22' }),
			}),
		]),
	);
});
