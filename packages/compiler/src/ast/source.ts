import type { SourceSpan } from '../artifacts.ts';
import type { AnyNode } from './nodes.ts';

export function expressionSource(node: AnyNode, source: string): string {
	if (typeof node.start !== 'number' || typeof node.end !== 'number') return '';

	return source.slice(node.start, node.end).trim();
}

export function expressionSourceOrFallback(
	node: AnyNode | undefined,
	source: string,
	fallback: string,
): string {
	if (!node) return fallback;

	return expressionSource(node, source) || fallback;
}

export function sourceSpan(node: AnyNode, filename: string): SourceSpan | undefined {
	if (typeof node.start !== 'number' || typeof node.end !== 'number') return undefined;

	return {
		filename,
		start: node.start,
		end: node.end,
	};
}
