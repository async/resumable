import {
	ASYNC_PROTOCOL_VERSION,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@async/resumable-protocol';
import { deserializeGraphValue, type SerializedGraphPayload } from '@async/resumable-serializer';
import { createRuntimeGraph, type RuntimeGraph } from './graph.ts';
import {
	createResumeRuntime,
	type ResumeDomElement,
	type ResumeRuntime,
	type ResumeRuntimeInput,
} from './resume.ts';

export type EncodedPayloadScripts = {
	readonly stateScript: string;
	readonly viewScript: string;
};

export type PayloadScriptElement = {
	readonly textContent?: string | null;
	readonly text?: string | null;
	readonly innerHTML?: string | null;
};

export type PayloadScriptDocument = {
	readonly querySelector: (selector: string) => PayloadScriptElement | null;
};

export type DecodedPayloadScripts = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};

export type ResumePayloadScriptsInput = EncodedPayloadScripts & {
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly createVisibilityObserver?: ResumeRuntimeInput['createVisibilityObserver'];
	readonly applyDomJournal?: ResumeRuntimeInput['applyDomJournal'];
};

export type ResumePayloadDocumentInput = Omit<
	ResumePayloadScriptsInput,
	'stateScript' | 'viewScript'
> & {
	readonly document: PayloadScriptDocument;
};

export type ResumePayloadScriptsResult = {
	readonly decoded: DecodedPayloadScripts;
	readonly graph: RuntimeGraph;
	readonly runtime: ResumeRuntime;
};

export type RuntimePayloadType = 'async/state' | 'async/view';

export type RuntimePayloadErrorCode = 'AA_PAYLOAD_INVALID' | 'AA_PROTOCOL_VERSION_MISMATCH';

export type RuntimePayloadDiagnostic = {
	readonly code: RuntimePayloadErrorCode;
	readonly severity: 'error';
	readonly phase: 'payload';
	readonly title: string;
	readonly message: string;
	readonly why: string;
	readonly payloadType: RuntimePayloadType;
	readonly payloadScript: string;
	readonly expectedVersion?: number;
	readonly actualVersion?: unknown;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;
};

export class RuntimePayloadError extends Error implements RuntimePayloadDiagnostic {
	readonly code: RuntimePayloadErrorCode;
	readonly severity: 'error';
	readonly phase: 'payload';
	readonly title: string;
	readonly why: string;
	readonly payloadType: RuntimePayloadType;
	readonly payloadScript: string;
	readonly expectedVersion?: number;
	readonly actualVersion?: unknown;
	readonly suggestions: ReadonlyArray<{ readonly message: string }>;
	readonly docsUrl: string;

	constructor(diagnostic: RuntimePayloadDiagnostic) {
		super(diagnostic.message);
		this.name = 'RuntimePayloadError';
		this.code = diagnostic.code;
		this.severity = diagnostic.severity;
		this.phase = diagnostic.phase;
		this.title = diagnostic.title;
		this.why = diagnostic.why;
		this.payloadType = diagnostic.payloadType;
		this.payloadScript = diagnostic.payloadScript;
		this.expectedVersion = diagnostic.expectedVersion;
		this.actualVersion = diagnostic.actualVersion;
		this.suggestions = diagnostic.suggestions;
		this.docsUrl = diagnostic.docsUrl;
	}
}

export function decodePayloadScripts(input: EncodedPayloadScripts): DecodedPayloadScripts {
	const state = parseDataScript(input.stateScript, 'async/state') as ProtocolStatePayload;
	const view = parseDataScript(input.viewScript, 'async/view') as ProtocolViewPayload;

	assertStatePayloadShape(state);
	assertViewPayloadShape(view);
	assertProtocolVersion(state.version, 'async/state');
	assertProtocolVersion(view.version, 'async/view');

	return { state, view };
}

export function readPayloadScriptsFromDocument(
	document: PayloadScriptDocument,
): EncodedPayloadScripts {
	return {
		stateScript: readPayloadScriptFromDocument(document, 'async/state'),
		viewScript: readPayloadScriptFromDocument(document, 'async/view'),
	};
}

export function decodePayloadScriptsFromDocument(
	document: PayloadScriptDocument,
): DecodedPayloadScripts {
	return decodePayloadScripts(readPayloadScriptsFromDocument(document));
}

export function createRuntimeGraphFromStatePayload(payload: ProtocolStatePayload): RuntimeGraph {
	return createRuntimeGraph({
		cells: payload.cells.map((cell) => ({
			bindingId: cell.bindingId,
			value:
				cell.value === undefined
					? undefined
					: deserializeGraphValue(cell.value as SerializedGraphPayload),
		})),
	});
}

export async function resumeFromPayloadScripts(
	input: ResumePayloadScriptsInput,
): Promise<ResumePayloadScriptsResult> {
	const decoded = decodePayloadScripts(input);
	const graph = createRuntimeGraphFromStatePayload(decoded.state);
	const runtime = createResumeRuntime({
		root: input.root,
		graph,
		view: decoded.view,
		loadSymbol: input.loadSymbol,
		createVisibilityObserver: input.createVisibilityObserver,
		applyDomJournal: input.applyDomJournal,
	});

	await runtime.start();

	return {
		decoded,
		graph,
		runtime,
	};
}

export async function resumeFromPayloadDocument(
	input: ResumePayloadDocumentInput,
): Promise<ResumePayloadScriptsResult> {
	const scripts = readPayloadScriptsFromDocument(input.document);
	return resumeFromPayloadScripts({
		...scripts,
		root: input.root,
		loadSymbol: input.loadSymbol,
		createVisibilityObserver: input.createVisibilityObserver,
		applyDomJournal: input.applyDomJournal,
	});
}

function parseDataScript(script: string, type: RuntimePayloadType): unknown {
	const prefix = `<script type="${type}">`;
	const suffix = '</script>';

	if (!script.startsWith(prefix) || !script.endsWith(suffix)) {
		throw payloadInvalidError(
			type,
			`Expected ${type} payload script.`,
			`Browser resume expects the ${type} data to arrive in a canonical ${payloadScriptSelector(type)} script wrapper before decoding the resumability protocol.`,
			[
				{
					message: `Emit the ${type} payload with renderPayloadScripts or an equivalent canonical script wrapper.`,
				},
			],
		);
	}

	try {
		return JSON.parse(script.slice(prefix.length, -suffix.length));
	} catch {
		throw payloadInvalidError(
			type,
			`Invalid ${type} payload JSON.`,
			`The ${type} payload script must contain valid JSON before the runtime can validate the resumability protocol fields.`,
			[
				{
					message: `Emit valid JSON inside the ${payloadScriptSelector(type)} script content.`,
				},
			],
		);
	}
}

function assertStatePayloadShape(payload: unknown): asserts payload is ProtocolStatePayload {
	if (!isRecord(payload)) {
		throw invalidPayloadShapeError(
			'async/state',
			'Invalid async/state payload: expected object.',
		);
	}
	if (!('version' in payload)) {
		throw invalidPayloadShapeError(
			'async/state',
			'Invalid async/state payload: expected version.',
		);
	}
	if (!Array.isArray(payload.cells)) {
		throw invalidPayloadShapeError(
			'async/state',
			'Invalid async/state payload: expected cells array.',
		);
	}

	for (const [index, cell] of payload.cells.entries()) {
		const context = `async/state cell[${index}]`;
		assertRecordShape(cell, context);
		assertStringField(cell, 'bindingId', context);
		assertStringField(cell, 'name', context);
		assertStateValueKind(cell, context);
	}

	if ('computed' in payload) {
		if (!Array.isArray(payload.computed)) {
			throw invalidPayloadShapeError(
				'async/state',
				'Invalid async/state payload: expected computed array.',
			);
		}

		for (const [index, computed] of payload.computed.entries()) {
			const context = `async/state computed[${index}]`;
			assertRecordShape(computed, context);
			assertStringField(computed, 'bindingId', context);
			assertStringField(computed, 'name', context);
			assertBooleanField(computed, 'async', context);
		}
	}
}

function assertViewPayloadShape(payload: unknown): asserts payload is ProtocolViewPayload {
	if (!isRecord(payload)) {
		throw invalidPayloadShapeError(
			'async/view',
			'Invalid async/view payload: expected object.',
		);
	}
	if (!('version' in payload)) {
		throw invalidPayloadShapeError(
			'async/view',
			'Invalid async/view payload: expected version.',
		);
	}

	for (const key of [
		'locators',
		'events',
		'bindings',
		'behaviors',
		'elementHandles',
		'asyncBoundaries',
	]) {
		if (!Array.isArray(payload[key])) {
			throw invalidPayloadShapeError(
				'async/view',
				`Invalid async/view payload: expected ${key} array.`,
			);
		}
	}

	for (const [index, locator] of payload.locators.entries()) {
		const context = `async/view locator[${index}]`;
		assertRecordShape(locator, context);
		assertStringField(locator, 'hostNodeId', context);
		assertLiteralField(locator, 'strategy', 'dom-order', context);
		assertNumberField(locator, 'index', context);
		assertStringField(locator, 'tagName', context);
	}

	for (const [index, event] of payload.events.entries()) {
		const context = `async/view event[${index}]`;
		assertRecordShape(event, context);
		assertStringField(event, 'hostNodeId', context);
		assertStringField(event, 'eventName', context);
		assertStringArrayField(event, 'symbolIds', context);
		if (event.syncPolicy !== undefined) {
			assertSyncPolicy(event.syncPolicy, `${context}.syncPolicy`);
		}
	}

	for (const [index, binding] of payload.bindings.entries()) {
		const context = `async/view binding[${index}]`;
		assertRecordShape(binding, context);
		assertStringField(binding, 'hostNodeId', context);
		assertStringField(binding, 'source', context);
		assertStringField(binding, 'bindingId', context);
		assertStringArrayField(binding, 'path', context);
		assertOptionalBindingTarget(binding.target, `${context}.target`);
		assertOptionalStringField(binding, 'symbolId', context);
	}

	for (const [index, behavior] of payload.behaviors.entries()) {
		const context = `async/view behavior[${index}]`;
		assertRecordShape(behavior, context);
		assertStringField(behavior, 'hostNodeId', context);
		assertStringField(behavior, 'source', context);
		assertOptionalStringField(behavior, 'symbolId', context);
	}

	for (const [index, handle] of payload.elementHandles.entries()) {
		const context = `async/view elementHandle[${index}]`;
		assertRecordShape(handle, context);
		assertStringField(handle, 'hostNodeId', context);
		assertStringField(handle, 'handleId', context);
		assertStringField(handle, 'name', context);
	}

	for (const [index, boundary] of payload.asyncBoundaries.entries()) {
		const context = `async/view asyncBoundary[${index}]`;
		assertRecordShape(boundary, context);
		assertStringField(boundary, 'id', context);
		assertCommentAnchor(boundary.startAnchor, `${context}.startAnchor`);
		assertCommentAnchor(boundary.endAnchor, `${context}.endAnchor`);
		assertAsyncBoundaryReads(boundary.asyncReads, context);
	}
}

function assertProtocolVersion(version: unknown, type: RuntimePayloadType): void {
	if (version !== ASYNC_PROTOCOL_VERSION) {
		throw protocolVersionMismatchError(type, version);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertRecordShape(
	value: unknown,
	context: string,
): asserts value is Record<string, unknown> {
	if (!isRecord(value)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected object.`,
		);
	}
}

function assertStringField(record: Record<string, unknown>, key: string, context: string): void {
	if (typeof record[key] !== 'string') {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} string.`,
		);
	}
}

function assertOptionalStringField(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	if (record[key] !== undefined && typeof record[key] !== 'string') {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} string.`,
		);
	}
}

function assertNumberField(record: Record<string, unknown>, key: string, context: string): void {
	if (typeof record[key] !== 'number') {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} number.`,
		);
	}
}

function assertBooleanField(record: Record<string, unknown>, key: string, context: string): void {
	if (typeof record[key] !== 'boolean') {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} boolean.`,
		);
	}
}

function assertLiteralField(
	record: Record<string, unknown>,
	key: string,
	expected: string,
	context: string,
): void {
	if (record[key] !== expected) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} "${expected}".`,
		);
	}
}

function assertStringArrayField(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	if (!Array.isArray(record[key])) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected ${key} array.`,
		);
	}

	for (const value of record[key]) {
		if (typeof value !== 'string') {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected ${key} string array.`,
			);
		}
	}
}

function assertOptionalStringArrayField(
	record: Record<string, unknown>,
	key: string,
	context: string,
): void {
	if (record[key] !== undefined) {
		assertStringArrayField(record, key, context);
	}
}

function assertStateValueKind(record: Record<string, unknown>, context: string): void {
	if (
		record.valueKind !== 'scalar' &&
		record.valueKind !== 'object' &&
		record.valueKind !== 'array' &&
		record.valueKind !== 'unknown'
	) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			'Invalid ' + context + ': expected valueKind scalar, object, array, or unknown.',
		);
	}
}

function assertCommentAnchor(value: unknown, context: string): void {
	assertRecordShape(value, context);
	assertLiteralField(value, 'strategy', 'dom-order-comment', context);
	assertNumberField(value, 'index', context);
}

function assertAsyncBoundaryReads(value: unknown, context: string): void {
	if (!Array.isArray(value)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected asyncReads array.`,
		);
	}

	for (const [index, read] of value.entries()) {
		const readContext = `${context}.asyncRead[${index}]`;
		assertRecordShape(read, readContext);
		assertStringField(read, 'source', readContext);
		assertStringField(read, 'bindingId', readContext);
		assertStringArrayField(read, 'path', readContext);
		assertOptionalStringField(read, 'runnerSymbolId', readContext);
	}
}

function assertOptionalBindingTarget(value: unknown, context: string): void {
	if (value === undefined) return;

	assertRecordShape(value, context);
	if (value.kind === 'text') return;
	if (value.kind === 'class') return;
	if (value.kind === 'style') return;
	if (value.kind === 'attribute') {
		if (typeof value.name !== 'string') {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected attribute name string.`,
			);
		}
		return;
	}
	if (value.kind === 'property') {
		if (typeof value.name !== 'string') {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected property name string.`,
			);
		}
		return;
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected supported binding target kind.`,
	);
}

function assertSyncPolicy(value: unknown, context: string): void {
	assertRecordShape(value, context);

	if ('branches' in value) {
		if (!Array.isArray(value.branches)) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected branches array.`,
			);
		}

		for (const [index, branch] of value.branches.entries()) {
			assertSyncPolicyBranch(branch, `${context}.branch[${index}]`);
		}
		return;
	}

	assertSyncPolicyBranch(value, context);
}

function assertSyncPolicyBranch(value: unknown, context: string): void {
	assertRecordShape(value, context);
	assertSyncPolicyCondition(value.when, `${context}.when`);

	if (!Array.isArray(value.actions)) {
		throw invalidPayloadShapeError(
			contextPayloadType(context),
			`Invalid ${context}: expected actions array.`,
		);
	}

	for (const action of value.actions) {
		if (action !== 'preventDefault' && action !== 'stopPropagation') {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected supported sync action.`,
			);
		}
	}
}

function assertSyncPolicyCondition(value: unknown, context: string): void {
	assertRecordShape(value, context);

	if (value.type === 'and' || value.type === 'or') {
		if (!Array.isArray(value.conditions)) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected conditions array.`,
			);
		}

		for (const [index, condition] of value.conditions.entries()) {
			assertSyncPolicyCondition(condition, `${context}.condition[${index}]`);
		}
		return;
	}

	if (value.type === 'not') {
		assertSyncPolicyCondition(value.condition, `${context}.condition`);
		return;
	}

	if (value.type === 'graph-truthy') {
		assertStringField(value, 'bindingId', context);
		assertOptionalStringArrayField(value, 'path', context);
		return;
	}

	if (value.type === 'constant-truthy') {
		if (!('value' in value)) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected value.`,
			);
		}
		return;
	}

	if (value.type === 'event-equals') {
		assertStringField(value, 'field', context);
		if (!('value' in value)) {
			throw invalidPayloadShapeError(
				contextPayloadType(context),
				`Invalid ${context}: expected value.`,
			);
		}
		return;
	}

	throw invalidPayloadShapeError(
		contextPayloadType(context),
		`Invalid ${context}: expected supported condition type.`,
	);
}

function readPayloadScriptFromDocument(
	document: PayloadScriptDocument,
	type: RuntimePayloadType,
): string {
	const element = document.querySelector(`script[type="${type}"]`);
	if (!element) {
		throw payloadInvalidError(
			type,
			`Missing ${type} payload script.`,
			`Browser resume requires the ${payloadScriptSelector(type)} script to exist before the runtime can decode the resumability payload.`,
			[
				{
					message: `Include a ${payloadScriptSelector(type)} script in the rendered document.`,
				},
			],
		);
	}

	const text = element.textContent ?? element.text ?? element.innerHTML;
	if (text == null) {
		throw payloadInvalidError(
			type,
			`Missing ${type} payload script content.`,
			`Browser resume found ${payloadScriptSelector(type)}, but the script did not expose text content for the runtime to decode.`,
			[
				{
					message: `Render JSON payload content inside ${payloadScriptSelector(type)}.`,
				},
			],
		);
	}

	return `<script type="${type}">${text}</script>`;
}

function payloadInvalidError(
	payloadType: RuntimePayloadType,
	message: string,
	why: string,
	suggestions: ReadonlyArray<{ readonly message: string }>,
): RuntimePayloadError {
	return new RuntimePayloadError({
		code: 'AA_PAYLOAD_INVALID',
		severity: 'error',
		phase: 'payload',
		title: 'Invalid resumability payload',
		message,
		why,
		payloadType,
		payloadScript: payloadScriptSelector(payloadType),
		suggestions,
		docsUrl: 'https://async.await.dev/errors/AA_PAYLOAD_INVALID',
	});
}

function invalidPayloadShapeError(
	payloadType: RuntimePayloadType,
	message: string,
): RuntimePayloadError {
	return payloadInvalidError(
		payloadType,
		message,
		`The ${payloadType} payload did not match the resumability protocol shape required by this runtime.`,
		[
			{
				message: `Regenerate the ${payloadType} payload with the matching @async/resumable compiler/runtime version.`,
			},
		],
	);
}

function protocolVersionMismatchError(
	payloadType: RuntimePayloadType,
	actualVersion: unknown,
): RuntimePayloadError {
	return new RuntimePayloadError({
		code: 'AA_PROTOCOL_VERSION_MISMATCH',
		severity: 'error',
		phase: 'payload',
		title: 'Unsupported resumability protocol version',
		message: `Unsupported ${payloadType} protocol version ${String(actualVersion)}.`,
		why: `The ${payloadType} payload was produced for protocol version ${String(actualVersion)}, but this runtime can only decode version ${String(ASYNC_PROTOCOL_VERSION)}.`,
		payloadType,
		payloadScript: payloadScriptSelector(payloadType),
		expectedVersion: ASYNC_PROTOCOL_VERSION,
		actualVersion,
		suggestions: [
			{
				message: 'Use matching @async/resumable compiler and runtime package versions.',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_PROTOCOL_VERSION_MISMATCH',
	});
}

function contextPayloadType(context: string): RuntimePayloadType {
	return context.startsWith('async/state') ? 'async/state' : 'async/view';
}

function payloadScriptSelector(type: RuntimePayloadType): string {
	return `script[type="${type}"]`;
}
