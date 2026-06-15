import type { CompilerPassDefinition, CompilerPassGraph } from './artifacts.ts';

export function validateCompilerPassGraph(
	passes: ReadonlyArray<CompilerPassDefinition>,
	initialArtifacts: ReadonlyArray<string>,
): CompilerPassGraph {
	const producers = new Map<string, string>();
	const passIds = new Set<string>();

	for (const pass of passes) {
		if (passIds.has(pass.passId)) {
			throw new Error(`Compiler pass "${pass.passId}" is declared more than once.`);
		}
		passIds.add(pass.passId);

		for (const artifact of pass.produces) {
			const producer = producers.get(artifact);
			if (producer) {
				throw new Error(
					`Compiler artifact "${artifact}" is produced by both "${producer}" and "${pass.passId}".`,
				);
			}

			producers.set(artifact, pass.passId);
		}
	}

	const knownArtifacts = new Set(initialArtifacts);
	const orderedPassIds: string[] = [];
	const remaining = [...passes];

	while (remaining.length > 0) {
		const nextIndex = remaining.findIndex((pass) =>
			pass.consumes.every((artifact) => knownArtifacts.has(artifact)),
		);

		if (nextIndex === -1) {
			const missing = findMissingCompilerArtifact(remaining, knownArtifacts, producers);
			if (missing) {
				throw new Error(
					`Missing compiler artifact "${missing.artifact}" consumed by pass "${missing.passId}".`,
				);
			}

			throw new Error(
				`Compiler pass graph has a dependency cycle involving ${remaining
					.map((pass) => pass.passId)
					.join(', ')}.`,
			);
		}

		const [pass] = remaining.splice(nextIndex, 1);
		orderedPassIds.push(pass.passId);

		for (const artifact of pass.produces) {
			knownArtifacts.add(artifact);
		}
	}

	return {
		orderedPassIds,
		artifacts: [...knownArtifacts],
	};
}

function findMissingCompilerArtifact(
	passes: ReadonlyArray<CompilerPassDefinition>,
	knownArtifacts: ReadonlySet<string>,
	producers: ReadonlyMap<string, string>,
): { readonly artifact: string; readonly passId: string } | null {
	for (const pass of passes) {
		for (const artifact of pass.consumes) {
			if (!knownArtifacts.has(artifact) && !producers.has(artifact)) {
				return {
					artifact,
					passId: pass.passId,
				};
			}
		}
	}

	return null;
}
