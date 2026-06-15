import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { collectObjectPatternAliases } from './collect-aliases.ts';
import type { WalkState } from './types.ts';

export function getComponent(node: AnyNode): AnyNode | null {
	if (node.type === 'FunctionDeclaration') return node;

	if (node.type === 'ExportNamedDeclaration') {
		const declaration = node.declaration as AnyNode | undefined;
		return declaration?.type === 'FunctionDeclaration' ? declaration : null;
	}

	return null;
}

export function collectComponentProps(component: AnyNode, state: WalkState): void {
	const firstParam = asNodes(component.params)[0];
	if (!firstParam) return;

	if (firstParam.type === 'Identifier') {
		const name = getIdentifierName(firstParam);
		if (!name) return;

		state.graph.graphBindings.push({
			id: `prop:${name}`,
			name,
			kind: 'prop',
			declarationKind: 'const',
			writable: false,
			valueKind: 'object',
		});
		return;
	}

	if (firstParam.type !== 'ObjectPattern') return;

	state.graph.graphBindings.push({
		id: 'prop:props',
		name: 'props',
		kind: 'prop',
		declarationKind: 'const',
		writable: false,
		valueKind: 'object',
	});
	collectObjectPatternAliases(firstParam, 'props', 'const', state);
}
