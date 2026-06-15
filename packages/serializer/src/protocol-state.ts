import { ASYNC_PROTOCOL_VERSION, type ProtocolStatePayload } from '@async/resumable-protocol';
import { serializeGraphValue } from './value.ts';

export type ProtocolStatePayloadInput = {
	readonly cells: ReadonlyArray<{
		readonly bindingId: string;
		readonly name: string;
		readonly valueKind: 'scalar' | 'object' | 'array' | 'unknown';
		readonly value: unknown;
	}>;
	readonly computed?: ProtocolStatePayload['computed'];
};

export function createProtocolStatePayload(input: ProtocolStatePayloadInput): ProtocolStatePayload {
	return {
		version: ASYNC_PROTOCOL_VERSION,
		cells: input.cells.map((cell) => {
			const result = serializeGraphValue(cell.value);
			if (!result.ok) {
				throw new Error(
					result.diagnostics[0]?.message ?? 'Cannot serialize protocol state cell.',
				);
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
