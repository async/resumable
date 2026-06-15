import { createProtocolStatePayload } from '@async/resumable-serializer';
import type { ProtocolStatePayload } from '@async/resumable-protocol';
import type { ProtocolStatePayloadInput } from '../artifacts.ts';

export function createProtocolStatePayloadFromArena(
	input: ProtocolStatePayloadInput,
): ProtocolStatePayload {
	return createProtocolStatePayload({
		cells: input.payloadArena.state.cells.map((cell) => {
			const binding = input.semanticGraph.graphBindings.find(
				(candidate) => candidate.id === cell.bindingId,
			);

			return {
				...cell,
				valueKind: cell.valueKind ?? 'unknown',
				value: binding?.initialValue,
			};
		}),
		computed: input.payloadArena.state.computed,
	});
}
