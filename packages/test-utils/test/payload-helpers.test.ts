import { expect, test } from 'vitest';
import { assertPayloadScriptTypes, summarizeProtocolPayload } from '../src/index.ts';

test('assertPayloadScriptTypes validates async payload script markers', () => {
	expect(() =>
		assertPayloadScriptTypes({
			stateScript: '<script type="async/state">{"version":1}</script>',
			viewScript: '<script type="async/view">{"version":1}</script>',
		}),
	).not.toThrow();

	expect(() =>
		assertPayloadScriptTypes({
			stateScript: '<script type="application/json">{"version":1}</script>',
			viewScript: '<script type="async/view">{"version":1}</script>',
		}),
	).toThrow('Expected async/state payload script.');

	expect(() =>
		assertPayloadScriptTypes({
			stateScript: '<script type="async/state">{"version":1}</script>',
			viewScript: '<script type="application/json">{"version":1}</script>',
		}),
	).toThrow('Expected async/view payload script.');
});

test('summarizeProtocolPayload counts protocol records for fixture assertions', () => {
	expect(
		summarizeProtocolPayload({
			state: {
				version: 1,
				cells: [{ bindingId: 'state:count', name: 'count', valueKind: 'scalar', value: 1 }],
				computed: [],
			},
			view: {
				version: 1,
				locators: [
					{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' },
				],
				events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:click'] }],
				bindings: [
					{
						hostNodeId: 'h0',
						source: 'count',
						bindingId: 'state:count',
						path: [],
						symbolId: 'symbol:binding',
					},
				],
				behaviors: [{ hostNodeId: 'h0', source: 'buttonBehavior', symbolId: 'symbol:use' }],
				elementHandles: [],
				asyncBoundaries: [],
			},
		}),
	).toEqual({
		cells: 1,
		locators: 1,
		events: 1,
		bindings: 1,
		behaviors: 1,
	});
});
