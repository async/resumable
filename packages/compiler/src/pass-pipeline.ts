import type {
	CompilerArtifactDump,
	CompilerArtifactMap,
	CompilerArtifactDumper,
	RunCompilerPassPipelineInput,
	RunCompilerPassPipelineResult,
	RunnableCompilerPassDefinition,
} from './artifacts.ts';
import { CompilerPassGraphError, validateCompilerPassGraph } from './pass-graph.ts';

export async function runCompilerPassPipeline(
	input: RunCompilerPassPipelineInput,
): Promise<RunCompilerPassPipelineResult> {
	const initialArtifactKeys = Object.keys(input.initialArtifacts);
	const passGraph = validateCompilerPassGraph(input.passes, initialArtifactKeys);
	const passesById = new Map(input.passes.map((pass) => [pass.passId, pass]));
	const artifacts: Record<string, unknown> = { ...input.initialArtifacts };
	const artifactDumps: CompilerArtifactDump[] = [];

	for (const passId of passGraph.orderedPassIds) {
		const pass = passesById.get(passId);
		if (!pass) continue;

		const outputs = await pass.run({
			passId,
			inputs: consumedArtifacts(pass, artifacts),
		});

		validatePassOutputs(pass, outputs);

		for (const artifactKey of pass.produces) {
			const value = outputs[artifactKey];
			artifacts[artifactKey] = value;

			if (input.dumpArtifact) {
				artifactDumps.push({
					passId,
					artifactKey,
					dump: input.dumpArtifact({ passId, artifactKey, value }),
				});
			}
		}
	}

	return {
		passGraph,
		artifacts,
		artifactDumps,
	};
}

export const formatCompilerArtifactDump: CompilerArtifactDumper = ({
	passId,
	artifactKey,
	value,
}) => {
	const json = JSON.stringify(normalizeArtifactDumpValue(value, new WeakSet()), null, 2);

	return [`# ${passId} -> ${artifactKey}`, '', '```json', json ?? 'null', '```'].join('\n');
};

function normalizeArtifactDumpValue(value: unknown, seen: WeakSet<object>): unknown {
	if (value === undefined) return '[undefined]';
	if (typeof value === 'bigint') return `${value.toString()}n`;
	if (typeof value === 'symbol') return String(value);
	if (typeof value === 'function') return functionDumpLabel(value);
	if (value === null || typeof value !== 'object') return value;

	if (seen.has(value)) return '[Circular]';
	seen.add(value);

	if (Array.isArray(value)) {
		const output = value.map((item) => normalizeArtifactDumpValue(item, seen));
		seen.delete(value);
		return output;
	}

	if (value instanceof Map) {
		const output = {
			$type: 'Map',
			entries: [...value.entries()].map(([key, item]) => [
				normalizeArtifactDumpValue(key, seen),
				normalizeArtifactDumpValue(item, seen),
			]),
		};
		seen.delete(value);
		return output;
	}

	if (value instanceof Set) {
		const output = {
			$type: 'Set',
			values: [...value.values()].map((item) => normalizeArtifactDumpValue(item, seen)),
		};
		seen.delete(value);
		return output;
	}

	const output: Record<string, unknown> = {};
	for (const key of Object.keys(value).sort()) {
		output[key] = normalizeArtifactDumpValue((value as Record<string, unknown>)[key], seen);
	}

	seen.delete(value);
	return output;
}

function functionDumpLabel(value: Function): string {
	return value.name ? `[Function ${value.name}]` : '[Function]';
}

function consumedArtifacts(
	pass: RunnableCompilerPassDefinition,
	artifacts: CompilerArtifactMap,
): CompilerArtifactMap {
	const inputs: Record<string, unknown> = {};

	for (const artifactKey of pass.consumes) {
		inputs[artifactKey] = artifacts[artifactKey];
	}

	return inputs;
}

function validatePassOutputs(
	pass: RunnableCompilerPassDefinition,
	outputs: CompilerArtifactMap,
): void {
	const declaredOutputs = new Set(pass.produces);

	for (const artifactKey of Object.keys(outputs)) {
		if (declaredOutputs.has(artifactKey)) continue;

		throw new CompilerPassGraphError({
			message: `Compiler pass "${pass.passId}" produced undeclared artifact "${artifactKey}".`,
			why: 'Passes must communicate only through artifacts declared in the pass registry so dependency order and artifact dumps stay trustworthy.',
			reason: 'undeclared-pass-output',
			passId: pass.passId,
			artifactKeys: [artifactKey],
			suggestions: [
				{
					message:
						'Add the artifact to the pass produces list, or stop returning it from this pass.',
				},
			],
		});
	}

	for (const artifactKey of pass.produces) {
		if (Object.prototype.hasOwnProperty.call(outputs, artifactKey)) continue;

		throw new CompilerPassGraphError({
			message: `Compiler pass "${pass.passId}" did not produce declared artifact "${artifactKey}".`,
			why: 'A downstream pass may depend on every artifact listed in produces, so missing outputs must fail at the owning pass boundary.',
			reason: 'missing-pass-output',
			passId: pass.passId,
			artifactKeys: [artifactKey],
			suggestions: [
				{
					message:
						'Return the declared artifact from this pass, or remove it from the pass produces list.',
				},
			],
		});
	}
}
