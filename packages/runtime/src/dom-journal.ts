import type { DomJournalEntry } from './graph.ts';
import type { ProtocolViewPayload } from '@async/resumable-protocol';

type InsertRangeEntry = Extract<DomJournalEntry, { readonly type: 'insertRange' }>;
type RemoveRangeEntry = Extract<DomJournalEntry, { readonly type: 'removeRange' }>;
type MoveRangeEntry = Extract<DomJournalEntry, { readonly type: 'moveRange' }>;

export type DomJournalApplyTarget = {
	textContent?: string | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
	readonly [name: string]: unknown;
};

export type DomJournalApplyOptions = {
	readonly resolveTarget: (locator: string, entry: DomJournalEntry) => unknown;
	readonly runCleanup?: (cleanupId: string, entry: DomJournalEntry) => void;
	readonly insertRange?: (
		anchorLocator: string,
		fragment: unknown,
		entry: InsertRangeEntry,
	) => void;
	readonly removeRange?: (rangeLocator: string, entry: RemoveRangeEntry) => void;
	readonly moveRange?: (
		rangeLocator: string,
		beforeLocator: string,
		entry: MoveRangeEntry,
	) => void;
};

export type DomUpdateEntryInput = {
	readonly locator: string;
	readonly target: NonNullable<ProtocolViewPayload['domUpdates'][number]['target']>;
	readonly value: unknown;
};

export function createDomUpdateEntry(input: DomUpdateEntryInput): DomJournalEntry {
	if (input.target.kind === 'text') {
		return {
			type: 'setText',
			locator: input.locator,
			value: input.value,
		};
	}

	if (input.target.kind === 'property') {
		return {
			type: 'setProp',
			locator: input.locator,
			name: input.target.name,
			value: input.value,
		};
	}

	if (input.target.kind === 'class') {
		return {
			type: 'setAttr',
			locator: input.locator,
			name: 'class',
			value: input.value,
		};
	}

	if (input.target.kind === 'style') {
		return {
			type: 'setAttr',
			locator: input.locator,
			name: 'style',
			value: input.value,
		};
	}

	return {
		type: 'setAttr',
		locator: input.locator,
		name: input.target.name,
		value: input.value,
	};
}

export function applyDomJournalEntries(
	entries: ReadonlyArray<DomJournalEntry>,
	options: DomJournalApplyOptions,
): void {
	for (const entry of entries) {
		if (entry.type === 'runCleanup') {
			options.runCleanup?.(entry.locator, entry);
			continue;
		}

		if (entry.type === 'insertRange') {
			options.insertRange?.(entry.locator, entry.fragment, entry);
			continue;
		}

		if (entry.type === 'removeRange') {
			options.removeRange?.(entry.locator, entry);
			continue;
		}

		if (entry.type === 'moveRange') {
			options.moveRange?.(entry.locator, entry.before, entry);
			continue;
		}

		const target = options.resolveTarget(entry.locator, entry);
		if (!target) continue;

		if (entry.type === 'setText') {
			setText(target, entry.value);
			continue;
		}

		if (entry.type === 'setAttr') {
			setAttr(target, entry.name, entry.value);
			continue;
		}

		if (entry.type === 'setProp') {
			setProp(target, entry.name, entry.value);
			continue;
		}

		throw new TypeError(`Unsupported DOM journal entry "${entry.type}".`);
	}
}

function setText(target: unknown, value: unknown): void {
	(target as { textContent: string }).textContent = stringifyDomValue(value);
}

function setAttr(target: unknown, name: string, value: unknown): void {
	const element = target as DomJournalApplyTarget;
	if (value == null || value === false) {
		element.removeAttribute?.(name);
		return;
	}

	element.setAttribute?.(name, stringifyDomValue(value));
}

function setProp(target: unknown, name: string, value: unknown): void {
	(target as Record<string, unknown>)[name] = value;
}

function stringifyDomValue(value: unknown): string {
	if (value == null) return '';
	return String(value);
}
