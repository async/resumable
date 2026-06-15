import { expect, test } from 'vitest';
import { applyDomJournalRecords, createBindingDomJournalRecord } from '../src/index.ts';

type FakeElement = {
	textContent: string;
	disabled: boolean;
	readonly attributes: Map<string, string>;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
};

function element(): FakeElement {
	return {
		textContent: '',
		disabled: false,
		attributes: new Map(),
		setAttribute(name, value) {
			this.attributes.set(name, value);
		},
		removeAttribute(name) {
			this.attributes.delete(name);
		},
	};
}

test('runtime DOM journal applier mutates concrete text attribute and property targets in order', () => {
	const countText = { textContent: '' };
	const button = element();
	const targets = new Map<string, unknown>([
		['text:count', countText],
		['button:count', button],
	]);

	applyDomJournalRecords(
		[
			{ type: 'setText', locator: 'text:count', value: 1 },
			{
				type: 'setAttr',
				locator: 'button:count',
				name: 'data-count',
				value: 1,
			},
			{
				type: 'setProp',
				locator: 'button:count',
				name: 'disabled',
				value: true,
			},
		],
		{
			resolveTarget(locator) {
				return targets.get(locator);
			},
		},
	);

	expect(countText.textContent).toBe('1');
	expect(button.attributes.get('data-count')).toBe('1');
	expect(button.disabled).toBe(true);
});

test('runtime DOM journal applier removes nullish and false attributes', () => {
	const button = element();
	button.attributes.set('hidden', '');
	button.attributes.set('aria-busy', 'true');
	const targets = new Map<string, unknown>([['button:count', button]]);

	applyDomJournalRecords(
		[
			{ type: 'setAttr', locator: 'button:count', name: 'hidden', value: false },
			{ type: 'setAttr', locator: 'button:count', name: 'aria-busy', value: null },
		],
		{
			resolveTarget(locator) {
				return targets.get(locator);
			},
		},
	);

	expect(button.attributes.has('hidden')).toBe(false);
	expect(button.attributes.has('aria-busy')).toBe(false);
});

test('runtime DOM journal applier runs cleanup records in journal order', () => {
	const statusText = { textContent: '' };
	const cleanups: string[] = [];
	const steps: string[] = [];
	const targets = new Map<string, unknown>([['text:status', statusText]]);

	applyDomJournalRecords(
		[
			{ type: 'setText', locator: 'text:status', value: 'pending' },
			{ type: 'runCleanup', locator: 'behavior:menu' },
			{ type: 'setText', locator: 'text:status', value: 'done' },
		],
		{
			resolveTarget(locator) {
				steps.push(`resolve:${locator}`);
				return targets.get(locator);
			},
			runCleanup(cleanupId) {
				steps.push(`cleanup:${cleanupId}`);
				cleanups.push(cleanupId);
			},
		},
	);

	expect(statusText.textContent).toBe('done');
	expect(cleanups).toEqual(['behavior:menu']);
	expect(steps).toEqual(['resolve:text:status', 'cleanup:behavior:menu', 'resolve:text:status']);
});

test('runtime DOM journal applier routes range records through host callbacks in journal order', () => {
	const steps: string[] = [];

	applyDomJournalRecords(
		[
			{ type: 'insertRange', locator: 'anchor:items', fragment: ['first', 'second'] },
			{ type: 'moveRange', locator: 'range:first', before: 'anchor:end' },
			{ type: 'removeRange', locator: 'range:second' },
		],
		{
			resolveTarget(locator) {
				steps.push(`resolve:${locator}`);
				return undefined;
			},
			insertRange(locator, fragment) {
				steps.push(`insert:${locator}:${(fragment as string[]).join(',')}`);
			},
			moveRange(locator, before) {
				steps.push(`move:${locator}->${before}`);
			},
			removeRange(locator) {
				steps.push(`remove:${locator}`);
			},
		},
	);

	expect(steps).toEqual([
		'insert:anchor:items:first,second',
		'move:range:first->anchor:end',
		'remove:range:second',
	]);
});

test('createBindingDomJournalRecord maps binding targets to concrete DOM operations', () => {
	expect(
		createBindingDomJournalRecord({
			locator: 'text:count',
			target: { kind: 'text' },
			value: 7,
		}),
	).toEqual({ type: 'setText', locator: 'text:count', value: 7 });

	expect(
		createBindingDomJournalRecord({
			locator: 'button:title',
			target: { kind: 'attribute', name: 'title' },
			value: 'Open',
		}),
	).toEqual({ type: 'setAttr', locator: 'button:title', name: 'title', value: 'Open' });

	expect(
		createBindingDomJournalRecord({
			locator: 'input:value',
			target: { kind: 'property', name: 'value' },
			value: 'Menu',
		}),
	).toEqual({ type: 'setProp', locator: 'input:value', name: 'value', value: 'Menu' });

	expect(
		createBindingDomJournalRecord({
			locator: 'button:class',
			target: { kind: 'class' },
			value: 'is-active',
		}),
	).toEqual({ type: 'setAttr', locator: 'button:class', name: 'class', value: 'is-active' });

	expect(
		createBindingDomJournalRecord({
			locator: 'button:style',
			target: { kind: 'style' },
			value: 'color: red;',
		}),
	).toEqual({ type: 'setAttr', locator: 'button:style', name: 'style', value: 'color: red;' });
});
