import type {
	PayloadArenaArtifact,
	PayloadArenaInput,
	SemanticGraphBinding,
} from '../artifacts.ts';
import { resolveGraphPath, semanticAliasMap, uniqueBy } from '../artifact-helpers/graph-paths.ts';

export function planPayloadArena(input: PayloadArenaInput): PayloadArenaArtifact {
	const bindings = new Map<string, SemanticGraphBinding>();
	const aliases = semanticAliasMap(input.semanticGraph);

	for (const binding of input.semanticGraph.graphBindings) {
		bindings.set(binding.name, binding);
	}

	const cells = input.semanticGraph.graphBindings
		.filter((binding) => binding.kind === 'state')
		.map((binding) => ({
			graphNodeId: binding.id,
			name: binding.name,
			valueKind: binding.valueKind ?? 'unknown',
		}));
	const computed = input.semanticGraph.graphBindings
		.filter((binding) => binding.kind === 'computed' && binding.async === true)
		.map((binding) => ({
			graphNodeId: binding.id,
			name: binding.name,
			async: binding.async === true,
		}));
	const locators = input.semanticGraph.hostNodes.map((hostNode, index) => ({
		hostNodeId: hostNode.id,
		strategy: 'dom-order' as const,
		index,
		tagName: hostNode.tagName,
	}));
	const viewDomUpdates = input.semanticGraph.templateReads.flatMap((read) => {
		const resolved = resolveGraphPath(read.source, bindings, aliases);
		if (!resolved) return [];

		return [
			{
				hostNodeId: read.hostNodeId,
				source: read.source,
				graphNodeId: resolved.binding.id,
				path: resolved.path,
				target: read.target,
			},
		];
	});
	const elementHandles = input.semanticGraph.elementHandleBindings.flatMap((binding) => {
		const graphBinding = bindings.get(binding.handleName);
		if (!graphBinding || graphBinding.kind !== 'element') return [];

		return [
			{
				hostNodeId: binding.hostNodeId,
				handleId: graphBinding.id,
				name: binding.handleName,
			},
		];
	});
	const asyncBoundaries = input.semanticGraph.asyncBoundaries.map((boundary, index) => ({
		id: boundary.id,
		startAnchor: {
			strategy: 'dom-order-comment' as const,
			index: index * 2,
		},
		endAnchor: {
			strategy: 'dom-order-comment' as const,
			index: index * 2 + 1,
		},
		asyncReads: uniqueBy(
			input.semanticGraph.templateReads.flatMap((read) => {
				if (read.asyncBoundaryId !== boundary.id) return [];

				const resolved = resolveGraphPath(read.source, bindings, aliases);
				if (!resolved) return [];
				if (
					resolved.binding.kind !== 'computed' ||
					resolved.binding.asyncCapable !== true
				) {
					return [];
				}

				return [
					{
						source: read.source,
						graphNodeId: resolved.binding.id,
						path: resolved.path,
					},
				];
			}),
			(read) => `${read.graphNodeId}:${read.path.join('.')}:${read.source}`,
		),
	}));

	return {
		passId: 'payload-arena',
		state: {
			cells,
			computed,
		},
		view: {
			locators,
			events: input.semanticGraph.events,
			domUpdates: uniqueBy(
				viewDomUpdates,
				(domUpdate) =>
					`${domUpdate.hostNodeId}:${domUpdateTargetKey(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.path.join('.')}`,
			),
			behaviors: input.semanticGraph.behaviors,
			elementHandles,
			asyncBoundaries,
		},
		diagnostics: input.stateLowering.diagnostics,
	};
}

function domUpdateTargetKey(
	target: PayloadArenaArtifact['view']['domUpdates'][number]['target'],
): string {
	if (target.kind === 'attribute') return `attribute:${target.name}`;
	if (target.kind === 'property') return `property:${target.name}`;
	return target.kind;
}
