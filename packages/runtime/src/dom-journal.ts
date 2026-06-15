import type { DomJournalRecord } from './graph.ts';
import type { ProtocolViewPayload } from '@async/resumable-protocol';

type InsertRangeRecord = Extract<DomJournalRecord, { readonly type: 'insertRange' }>;
type RemoveRangeRecord = Extract<DomJournalRecord, { readonly type: 'removeRange' }>;
type MoveRangeRecord = Extract<DomJournalRecord, { readonly type: 'moveRange' }>;

export type DomJournalApplyTarget = {
	textContent?: string | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
	readonly [name: string]: unknown;
};

export type DomJournalApplyOptions = {
	readonly resolveTarget: (locator: string, record: DomJournalRecord) => unknown;
	readonly runCleanup?: (cleanupId: string, record: DomJournalRecord) => void;
	readonly insertRange?: (
		anchorLocator: string,
		fragment: unknown,
		record: InsertRangeRecord,
	) => void;
	readonly removeRange?: (rangeLocator: string, record: RemoveRangeRecord) => void;
	readonly moveRange?: (
		rangeLocator: string,
		beforeLocator: string,
		record: MoveRangeRecord,
	) => void;
};

export type BindingDomJournalInput = {
	readonly locator: string;
	readonly target: NonNullable<ProtocolViewPayload['bindings'][number]['target']>;
	readonly value: unknown;
};

export function createBindingDomJournalRecord(input: BindingDomJournalInput): DomJournalRecord {
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

export function applyDomJournalRecords(
	records: ReadonlyArray<DomJournalRecord>,
	options: DomJournalApplyOptions,
): void {
	for (const record of records) {
		if (record.type === 'runCleanup') {
			options.runCleanup?.(record.locator, record);
			continue;
		}

		if (record.type === 'insertRange') {
			options.insertRange?.(record.locator, record.fragment, record);
			continue;
		}

		if (record.type === 'removeRange') {
			options.removeRange?.(record.locator, record);
			continue;
		}

		if (record.type === 'moveRange') {
			options.moveRange?.(record.locator, record.before, record);
			continue;
		}

		const target = options.resolveTarget(record.locator, record);
		if (!target) continue;

		if (record.type === 'setText') {
			setText(target, record.value);
			continue;
		}

		if (record.type === 'setAttr') {
			setAttr(target, record.name, record.value);
			continue;
		}

		if (record.type === 'setProp') {
			setProp(target, record.name, record.value);
			continue;
		}

		throw new TypeError(`Unsupported DOM journal record "${record.type}".`);
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
