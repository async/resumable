import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { buildSemanticGraph, planPayloadLocators, planSchedulerJournal } from '../src/index.ts';

function valuesFor<T, K extends keyof T>(records: ReadonlyArray<T>, key: K): T[K][] {
	return records.map((record) => record[key]);
}

test('scheduler-journal fixture plans write batches, async versions, and DOM locator journal records', async () => {
	const fixturePath = 'fixtures/proofs/scheduler-journal/src/App.tsrx';
	const fixtureUrl = new URL(`../../../${fixturePath}`, import.meta.url);
	const source = await readFile(fixtureUrl, 'utf8');
	const graph = await buildSemanticGraph({
		filename: fixturePath,
		source,
	});
	const locators = planPayloadLocators(graph);

	const artifact = planSchedulerJournal({
		graph,
		locators,
	});

	expect(artifact.passId).toBe('scheduler-journal-planning');
	expect(artifact.filename).toBe(fixturePath);
	expect(artifact.scheduler).toEqual({
		writeFlush: 'microtask-after-handler-batch',
		handlerOrdering: 'authored-order',
		commitErrorPolicy: 'no-rollback-after-committed-writes',
	});
	expect(artifact.targetModel).toEqual({
		kind: 'dom-locator',
		locatorStrategy: 'dom-order-tree-walker',
		usesVdom: false,
	});

	expect(artifact.writeBatches).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				batchId: expect.stringContaining('onInput'),
				eventName: 'input',
				handlerIndex: 0,
				flush: 'microtask-after-handler-batch',
				writes: expect.arrayContaining([
					expect.objectContaining({ path: 'journal.filter' }),
					expect.objectContaining({ path: 'journal.revision' }),
					expect.objectContaining({ path: 'journal.message' }),
				]),
			}),
			expect.objectContaining({
				batchId: expect.stringContaining('ordered-handlers:0'),
				eventName: 'click',
				handlerIndex: 0,
				orderGroupId: 'ordered-handlers',
				writes: expect.arrayContaining([
					expect.objectContaining({ path: 'journal.firstHandlerSeen' }),
					expect.objectContaining({ path: 'journal.revision' }),
					expect.objectContaining({ path: 'journal.message' }),
				]),
			}),
			expect.objectContaining({
				batchId: expect.stringContaining('ordered-handlers:1'),
				eventName: 'click',
				handlerIndex: 1,
				orderGroupId: 'ordered-handlers',
				writes: expect.arrayContaining([
					expect.objectContaining({ path: 'journal.committed' }),
					expect.objectContaining({ path: 'journal.message' }),
				]),
			}),
		]),
	);

	const orderedHandlers = artifact.orderedHandlerGroups.find(
		(group) => group.orderGroupId === 'ordered-handlers',
	);
	expect(orderedHandlers).toMatchObject({
		eventName: 'click',
		handlerIndices: [0, 1],
		flush: 'after-all-handlers',
	});
	expect(valuesFor(orderedHandlers?.batches ?? [], 'batchId')).toEqual([
		expect.stringContaining('ordered-handlers:0'),
		expect.stringContaining('ordered-handlers:1'),
	]);

	expect(artifact.invalidationRoots).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				writePath: 'journal.filter',
				computedRoots: expect.arrayContaining(['visibleItems', 'summary']),
			}),
			expect.objectContaining({
				writePath: 'items',
				computedRoots: expect.arrayContaining(['visibleItems', 'selected', 'summary']),
			}),
			expect.objectContaining({
				writePath: 'journal.selectedId',
				computedRoots: expect.arrayContaining(['selected', 'preview']),
			}),
			expect.objectContaining({
				writePath: 'journal.revision',
				computedRoots: expect.arrayContaining(['flushLabel', 'preview']),
			}),
		]),
	);

	expect(artifact.asyncRunnerPlans).toEqual([
		expect.objectContaining({
			kind: 'async-computed-runner',
			name: 'preview',
			versioned: true,
			requestVersionSource: 'journal.revision',
			dependencyRoots: expect.arrayContaining(['journal.selectedId', 'journal.revision']),
			staleCompletionPolicy: 'ignore-older-request-version',
		}),
	]);
	expect(artifact.staleCompletionCases).toEqual([
		expect.objectContaining({
			asyncNode: 'preview',
			requestVersion: 3,
			graphVersion: 4,
			action: 'ignore',
			journalRecords: [],
		}),
	]);

	expect(artifact.journalRecordPlans).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'setText',
				source: 'summary',
				target: expect.objectContaining({ kind: 'dom-locator', usesVdom: false }),
			}),
			expect.objectContaining({
				kind: 'setText',
				source: 'flushLabel',
				target: expect.objectContaining({ kind: 'dom-locator', usesVdom: false }),
			}),
			expect.objectContaining({
				kind: 'setText',
				source: 'preview.title',
				target: expect.objectContaining({ kind: 'dom-locator', usesVdom: false }),
			}),
			expect.objectContaining({
				kind: 'setAttr',
				attribute: 'data-revision',
				source: 'journal.revision',
				target: expect.objectContaining({ kind: 'dom-locator', usesVdom: false }),
			}),
			expect.objectContaining({
				kind: 'setAttr',
				attribute: 'aria-busy',
				source: 'journal.busy',
				target: expect.objectContaining({ kind: 'dom-locator', usesVdom: false }),
			}),
		]),
	);

	expect(artifact.rangePlans).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'insertRange',
				rangeKind: 'branch',
				ownerId: 'branch0',
				condition: 'journal.open',
				target: expect.objectContaining({ kind: 'dom-locator', usesVdom: false }),
			}),
			expect.objectContaining({
				kind: 'removeRange',
				rangeKind: 'branch',
				ownerId: 'branch0',
				condition: 'journal.open',
			}),
			expect.objectContaining({
				kind: 'insertRange',
				rangeKind: 'keyed-list',
				ownerId: 'loop0',
				key: 'item.id',
			}),
			expect.objectContaining({
				kind: 'removeRange',
				rangeKind: 'keyed-list',
				ownerId: 'loop0',
				key: 'item.id',
			}),
			expect.objectContaining({
				kind: 'moveRange',
				rangeKind: 'keyed-list',
				ownerId: 'loop0',
				key: 'item.id',
			}),
		]),
	);

	expect(artifact.cleanupPlans).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				kind: 'runCleanup',
				rangeKind: 'branch',
				ownerId: 'branch0',
				behavior: expect.objectContaining({
					expression: expect.stringContaining('journalBehavior({'),
				}),
			}),
			expect.objectContaining({
				kind: 'runCleanup',
				rangeKind: 'keyed-list',
				ownerId: 'loop0',
				behavior: expect.objectContaining({
					expression: expect.stringContaining('journalBehavior({'),
				}),
			}),
		]),
	);

	expect(artifact.errorPlans).toEqual([
		expect.objectContaining({
			functionName: 'commitThenThrow',
			policy: 'no-rollback-after-committed-writes',
			committedWrites: expect.arrayContaining([
				expect.objectContaining({ path: 'journal.committed' }),
				expect.objectContaining({ path: 'journal.message' }),
			]),
			throwAfterCommit: true,
		}),
	]);
});
