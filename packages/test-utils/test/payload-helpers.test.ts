import { expect, test } from 'vitest';
import {
	assertPayloadScriptTypes,
	createPayloadDebugDump,
	decodePayloadScriptPair,
	summarizePayloadScripts,
	summarizeProtocolPayload,
} from '../src/index.ts';

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

	expect(() =>
		assertPayloadScriptTypes({
			stateScript: '<script type="async/state">{"version":1}',
			viewScript: '<script type="async/view">{"version":1}</script>',
		}),
	).toThrow('Expected async/state payload script.');
});

test('summarizeProtocolPayload counts protocol records for fixture assertions', () => {
	expect(
		summarizeProtocolPayload({
			state: {
				version: 1,
				cells: [{ bindingId: 'state:count', name: 'count', valueKind: 'scalar', value: 1 }],
				computed: [{ bindingId: 'computed:label', name: 'label', async: false }],
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
				elementHandles: [{ hostNodeId: 'h0', handleId: 'element:button', name: 'button' }],
				asyncBoundaries: [
					{
						id: 'boundary:profile',
						startAnchor: { strategy: 'dom-order-comment', index: 0 },
						endAnchor: { strategy: 'dom-order-comment', index: 1 },
						asyncReads: [
							{
								source: 'profile',
								bindingId: 'computed:profile',
								path: [],
								runnerSymbolId: 'symbol:profile',
							},
						],
					},
				],
			},
		}),
	).toEqual({
		cells: 1,
		computed: 1,
		locators: 1,
		events: 1,
		bindings: 1,
		behaviors: 1,
		elementHandles: 1,
		asyncBoundaries: 1,
	});
});

test('decodePayloadScriptPair parses canonical scripts for fixture assertions', () => {
	const stateScript =
		'<script type="async/state">{"version":1,"cells":[{"bindingId":"state:count","name":"count","valueKind":"scalar","value":1}],"computed":[{"bindingId":"computed:label","name":"label","async":false}]}</script>';
	const viewScript =
		'<script type="async/view">{"version":1,"locators":[{"hostNodeId":"h0","strategy":"dom-order","index":0,"tagName":"button"}],"events":[{"hostNodeId":"h0","eventName":"click","symbolIds":["symbol:click"]}],"bindings":[{"hostNodeId":"h0","source":"count","bindingId":"state:count","path":[],"target":{"kind":"text"},"symbolId":"symbol:binding"}],"behaviors":[{"hostNodeId":"h0","source":"buttonBehavior","symbolId":"symbol:use"}],"elementHandles":[{"hostNodeId":"h0","handleId":"element:button","name":"button"}],"asyncBoundaries":[{"id":"boundary:profile","startAnchor":{"strategy":"dom-order-comment","index":0},"endAnchor":{"strategy":"dom-order-comment","index":1},"asyncReads":[{"source":"profile","bindingId":"computed:profile","path":[],"runnerSymbolId":"symbol:profile"}]}]}</script>';

	expect(decodePayloadScriptPair({ stateScript, viewScript })).toEqual({
		state: {
			version: 1,
			cells: [{ bindingId: 'state:count', name: 'count', valueKind: 'scalar', value: 1 }],
			computed: [{ bindingId: 'computed:label', name: 'label', async: false }],
		},
		view: {
			version: 1,
			locators: [{ hostNodeId: 'h0', strategy: 'dom-order', index: 0, tagName: 'button' }],
			events: [{ hostNodeId: 'h0', eventName: 'click', symbolIds: ['symbol:click'] }],
			bindings: [
				{
					hostNodeId: 'h0',
					source: 'count',
					bindingId: 'state:count',
					path: [],
					target: { kind: 'text' },
					symbolId: 'symbol:binding',
				},
			],
			behaviors: [{ hostNodeId: 'h0', source: 'buttonBehavior', symbolId: 'symbol:use' }],
			elementHandles: [{ hostNodeId: 'h0', handleId: 'element:button', name: 'button' }],
			asyncBoundaries: [
				{
					id: 'boundary:profile',
					startAnchor: { strategy: 'dom-order-comment', index: 0 },
					endAnchor: { strategy: 'dom-order-comment', index: 1 },
					asyncReads: [
						{
							source: 'profile',
							bindingId: 'computed:profile',
							path: [],
							runnerSymbolId: 'symbol:profile',
						},
					],
				},
			],
		},
	});

	expect(summarizePayloadScripts({ stateScript, viewScript })).toEqual({
		cells: 1,
		computed: 1,
		locators: 1,
		events: 1,
		bindings: 1,
		behaviors: 1,
		elementHandles: 1,
		asyncBoundaries: 1,
	});
});

test('createPayloadDebugDump returns a human-readable decoded payload shape', () => {
	const stateScript =
		'<script type="async/state">{"version":1,"cells":[{"bindingId":"state:count","name":"count","valueKind":"scalar","value":1}],"computed":[{"bindingId":"computed:label","name":"label","async":false}]}</script>';
	const viewScript =
		'<script type="async/view">{"version":1,"locators":[{"hostNodeId":"h0","strategy":"dom-order","index":0,"tagName":"button"}],"events":[{"hostNodeId":"h0","eventName":"click","symbolIds":["symbol:click"]}],"bindings":[{"hostNodeId":"h0","source":"count","bindingId":"state:count","path":[],"target":{"kind":"text"},"symbolId":"symbol:binding"}],"behaviors":[{"hostNodeId":"h0","source":"buttonBehavior","symbolId":"symbol:use"}],"elementHandles":[{"hostNodeId":"h0","handleId":"element:button","name":"button"}],"asyncBoundaries":[{"id":"boundary:profile","startAnchor":{"strategy":"dom-order-comment","index":0},"endAnchor":{"strategy":"dom-order-comment","index":1},"asyncReads":[{"source":"profile","bindingId":"computed:profile","path":[],"runnerSymbolId":"symbol:profile"}]}]}</script>';

	expect(createPayloadDebugDump({ stateScript, viewScript })).toEqual({
		summary: {
			cells: 1,
			computed: 1,
			locators: 1,
			events: 1,
			bindings: 1,
			behaviors: 1,
			elementHandles: 1,
			asyncBoundaries: 1,
		},
		state: {
			version: 1,
			cells: [{ bindingId: 'state:count', name: 'count', valueKind: 'scalar' }],
			computed: [{ bindingId: 'computed:label', name: 'label', async: false }],
		},
		view: {
			version: 1,
			locators: [{ hostNodeId: 'h0', index: 0, tagName: 'button' }],
			events: [
				{
					hostNodeId: 'h0',
					eventName: 'click',
					symbolIds: ['symbol:click'],
					hasSyncPolicy: false,
				},
			],
			bindings: [
				{
					hostNodeId: 'h0',
					source: 'count',
					bindingId: 'state:count',
					path: [],
					target: { kind: 'text' },
					symbolId: 'symbol:binding',
				},
			],
			behaviors: [{ hostNodeId: 'h0', source: 'buttonBehavior', symbolId: 'symbol:use' }],
			elementHandles: [{ hostNodeId: 'h0', handleId: 'element:button', name: 'button' }],
			asyncBoundaries: [
				{
					id: 'boundary:profile',
					startIndex: 0,
					endIndex: 1,
					asyncReads: [
						{
							source: 'profile',
							bindingId: 'computed:profile',
							path: [],
							runnerSymbolId: 'symbol:profile',
						},
					],
				},
			],
		},
	});
});

test('createPayloadDebugDump preserves property binding targets', () => {
	const stateScript =
		'<script type="async/state">{"version":1,"cells":[{"bindingId":"state:title","name":"title","valueKind":"scalar","value":"Menu"}],"computed":[]}</script>';
	const viewScript =
		'<script type="async/view">{"version":1,"locators":[{"hostNodeId":"h0","strategy":"dom-order","index":0,"tagName":"input"}],"events":[],"bindings":[{"hostNodeId":"h0","source":"title","bindingId":"state:title","path":[],"target":{"kind":"property","name":"value"},"symbolId":"symbol:value"}],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>';

	expect(createPayloadDebugDump({ stateScript, viewScript }).view.bindings).toEqual([
		{
			hostNodeId: 'h0',
			source: 'title',
			bindingId: 'state:title',
			path: [],
			target: {
				kind: 'property',
				name: 'value',
			},
			symbolId: 'symbol:value',
		},
	]);
});

test('createPayloadDebugDump preserves class and style binding targets', () => {
	const stateScript =
		'<script type="async/state">{"version":1,"cells":[{"bindingId":"state:activeClass","name":"activeClass","valueKind":"scalar","value":"is-active"},{"bindingId":"state:color","name":"color","valueKind":"scalar","value":"red"}],"computed":[]}</script>';
	const viewScript =
		'<script type="async/view">{"version":1,"locators":[{"hostNodeId":"h0","strategy":"dom-order","index":0,"tagName":"div"}],"events":[],"bindings":[{"hostNodeId":"h0","source":"activeClass","bindingId":"state:activeClass","path":[],"target":{"kind":"class"},"symbolId":"symbol:class"},{"hostNodeId":"h0","source":"color","bindingId":"state:color","path":[],"target":{"kind":"style"},"symbolId":"symbol:style"}],"behaviors":[],"elementHandles":[],"asyncBoundaries":[]}</script>';

	expect(createPayloadDebugDump({ stateScript, viewScript }).view.bindings).toEqual([
		{
			hostNodeId: 'h0',
			source: 'activeClass',
			bindingId: 'state:activeClass',
			path: [],
			target: {
				kind: 'class',
			},
			symbolId: 'symbol:class',
		},
		{
			hostNodeId: 'h0',
			source: 'color',
			bindingId: 'state:color',
			path: [],
			target: {
				kind: 'style',
			},
			symbolId: 'symbol:style',
		},
	]);
});
