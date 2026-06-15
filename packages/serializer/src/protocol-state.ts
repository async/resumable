import { ASYNC_PROTOCOL_VERSION, type ProtocolStatePayload } from '@async/resumable-protocol';
import { serializeGraphValue, type SerializationDiagnostic } from './value.ts';

export type ProtocolStatePayloadInput = {
	readonly cells: ReadonlyArray<{
		readonly bindingId: string;
		readonly name: string;
		readonly valueKind: 'scalar' | 'object' | 'array' | 'unknown';
		readonly value: unknown;
	}>;
	readonly computed?: ProtocolStatePayload['computed'];
};

export type ProtocolStateSerializationDiagnostic = SerializationDiagnostic & {
	readonly bindingId: string;
	readonly cellName: string;
};

export class ProtocolStateSerializationError
	extends Error
	implements ProtocolStateSerializationDiagnostic
{
	readonly code: SerializationDiagnostic['code'];
	readonly severity: SerializationDiagnostic['severity'];
	readonly phase: SerializationDiagnostic['phase'];
	readonly title: SerializationDiagnostic['title'];
	readonly path: SerializationDiagnostic['path'];
	readonly statePath: SerializationDiagnostic['statePath'];
	readonly valueKind: SerializationDiagnostic['valueKind'];
	readonly why: SerializationDiagnostic['why'];
	readonly suggestions: SerializationDiagnostic['suggestions'];
	readonly docsUrl: SerializationDiagnostic['docsUrl'];
	readonly bindingId: string;
	readonly cellName: string;

	constructor(diagnostic: ProtocolStateSerializationDiagnostic) {
		super(diagnostic.message);
		this.name = 'ProtocolStateSerializationError';
		this.code = diagnostic.code;
		this.severity = diagnostic.severity;
		this.phase = diagnostic.phase;
		this.title = diagnostic.title;
		this.path = diagnostic.path;
		this.statePath = diagnostic.statePath;
		this.valueKind = diagnostic.valueKind;
		this.why = diagnostic.why;
		this.suggestions = diagnostic.suggestions;
		this.docsUrl = diagnostic.docsUrl;
		this.bindingId = diagnostic.bindingId;
		this.cellName = diagnostic.cellName;
	}
}

export function createProtocolStatePayload(input: ProtocolStatePayloadInput): ProtocolStatePayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		cells: input.cells.map((cell) => {
			const result = serializeGraphValue(cell.value);
			if (!result.ok) {
				throw protocolStateSerializationError(cell, result.diagnostics[0]);
			}

			return {
				bindingId: cell.bindingId,
				name: cell.name,
				valueKind: cell.valueKind,
				value: result.payload,
			};
		}),
		computed: input.computed ?? [],
	};
}

function protocolStateSerializationError(
	cell: ProtocolStatePayloadInput['cells'][number],
	diagnostic: SerializationDiagnostic | undefined,
): ProtocolStateSerializationError {
	const cellPrefix = cell.name === '' ? cell.bindingId : cell.name;
	const base = diagnostic ?? {
		code: 'AA_SERIALIZE_UNSUPPORTED_VALUE' as const,
		severity: 'error' as const,
		phase: 'serialization' as const,
		title: 'Cannot serialize graph state value' as const,
		path: [],
		statePath: cellPrefix,
		valueKind: 'unknown',
		message: `Cannot serialize value at ${cellPrefix} because unknown values are not durable graph state.`,
		why: 'Serialization is for durable graph state. Functions and host/runtime resources cannot be restored during resume.',
		suggestions: [
			{
				message:
					'Move runtime resources into use={...}, make the value serializable state, or derive it with computed().',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_SERIALIZE_UNSUPPORTED_VALUE',
	};
	const statePath = base.statePath === '<root>' ? cellPrefix : `${cellPrefix}.${base.statePath}`;

	return new ProtocolStateSerializationError({
		...base,
		bindingId: cell.bindingId,
		cellName: cell.name,
		statePath,
		message: `Cannot serialize value at ${statePath} because ${base.valueKind} values are not durable graph state.`,
	});
}
