import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSourceOrFallback } from '../../ast/source.ts';
import { moduleScopeGraphCreationDiagnostic } from './diagnostics.ts';
import type { MutableSemanticGraphArtifact } from './types.ts';

export function collectModuleScopeGraphCreation(
	statement: AnyNode,
	graph: MutableSemanticGraphArtifact,
	source: string,
	filename: string,
): void {
	const declaration = moduleScopeVariableDeclaration(statement);
	if (!declaration) return;

	for (const declarator of asNodes(declaration.declarations)) {
		const id = declarator.id as AnyNode | undefined;
		const init = declarator.init as AnyNode | undefined;
		const callName = getCallName(init);
		if (callName !== 'state' && callName !== 'computed') continue;

		graph.diagnostics.push(
			moduleScopeGraphCreationDiagnostic(
				moduleScopeDeclarationName(id, source),
				callName,
				init,
				filename,
			),
		);
	}
}

function moduleScopeVariableDeclaration(statement: AnyNode): AnyNode | null {
	if (statement.type === 'VariableDeclaration') return statement;

	if (statement.type === 'ExportNamedDeclaration') {
		const declaration = statement.declaration as AnyNode | undefined;
		return declaration?.type === 'VariableDeclaration' ? declaration : null;
	}

	return null;
}

function moduleScopeDeclarationName(node: AnyNode | undefined, source: string): string {
	return getIdentifierName(node) ?? expressionSourceOrFallback(node, source, 'graph binding');
}

function getCallName(node: AnyNode | undefined | null): string | null {
	if (node?.type !== 'CallExpression') return null;

	return getIdentifierName(node.callee as AnyNode | undefined);
}
