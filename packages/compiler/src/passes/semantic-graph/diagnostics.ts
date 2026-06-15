import type { AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type {
	SemanticElementHandleBinding,
	SemanticGraphDiagnostic,
	SemanticGraphBinding,
	SemanticStateRead,
	SemanticTemplateRead,
	SourceSpan,
} from '../../artifacts.ts';
import type { WalkState } from './types.ts';

export function moduleScopeGraphCreationDiagnostic(
	name: string,
	callName: 'state' | 'computed',
	init: AnyNode | undefined,
	filename: string,
): SemanticGraphDiagnostic {
	return {
		code: 'AA_STATE_MODULE_SCOPE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'state() and computed() cannot be created at module scope',
		message: `Cannot create "${name}" with ${callName}() at module scope.`,
		why: 'Module-scope graph state would be shared across requests and has no per-document serialization payload.',
		primarySpan: init ? sourceSpan(init, filename) : fallbackSpan(filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Move state() or computed() creation into a component or declare request/container/page state with shared().',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_STATE_MODULE_SCOPE',
	};
}

export function asyncPostAwaitReadDiagnostic(
	computedName: string,
	read: SemanticStateRead,
): SemanticGraphDiagnostic {
	return {
		code: 'AA_ASYNC_POST_AWAIT_READ',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Reactive reads after await are not resumable',
		message: `Cannot read "${read.source}" after await in async computed "${computedName}". Snapshot the value before awaiting.`,
		why: 'Async computed dependency keys are captured before the first await. Reading graph state after suspension would make revalidation and resume depend on hidden async timing.',
		primarySpan: read.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Read the graph value before the first await, or split post-await formatting into a separate sync computed().',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_ASYNC_POST_AWAIT_READ',
	};
}

export function asyncBoundaryRequiredDiagnostic(
	read: SemanticTemplateRead,
	binding: SemanticGraphBinding,
): SemanticGraphDiagnostic {
	const computedLabel = binding.async === true ? 'async computed' : 'async-capable computed';

	return {
		code: 'AA_ASYNC_BOUNDARY_REQUIRED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Async computed reads need an async boundary',
		message: `Cannot read ${computedLabel} "${read.source}" outside @try/@pending/@catch. Wrap the read in an async boundary.`,
		why: 'Async computed values can be pending or rejected during initial render and resume. The runtime needs an explicit TSRX async boundary to render pending and error UI.',
		primarySpan: read.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Wrap this template read in @try with @pending and @catch branches, or read a sync computed that is already guarded by an async boundary.',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_ASYNC_BOUNDARY_REQUIRED',
	};
}

export function elementHandleRequiredDiagnostic(
	binding: SemanticElementHandleBinding,
	graphBinding: SemanticGraphBinding | undefined,
): SemanticGraphDiagnostic {
	const actual = graphBinding ? `${graphBinding.kind}()` : 'an unknown value';

	return {
		code: 'AA_ELEMENT_HANDLE_REQUIRED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'el expects an element() handle',
		message: `Cannot bind el={${binding.handleName}} because "${binding.handleName}" is ${actual}, not an element() handle.`,
		why: 'DOM elements are host resources. el can only bind element() handles so resume can recover the current DOM locator without serializing a DOM node.',
		primarySpan: binding.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		elementLocator: binding.hostNodeId,
		suggestions: [
			{
				message:
					'Create a handle with element<T>() and bind that handle with el={handle}. Keep DOM-backed resources in use={...}.',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_ELEMENT_HANDLE_REQUIRED',
	};
}

export function duplicateElementHandleDiagnostic(
	binding: SemanticElementHandleBinding,
): SemanticGraphDiagnostic {
	return {
		code: 'AA_ELEMENT_HANDLE_DUPLICATE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'element() handle is bound more than once',
		message: `Cannot bind element handle "${binding.handleName}" to multiple live host elements.`,
		why: 'A resumed element handle must resolve to one current DOM locator. Binding one handle to multiple live elements would make lazy event code ambiguous.',
		primarySpan: binding.sourceSpan,
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		elementLocator: binding.hostNodeId,
		suggestions: [
			{
				message:
					'Create a separate element() handle for each host element, or move repeated element access into keyed state and behavior records.',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_ELEMENT_HANDLE_DUPLICATE',
	};
}

export function useHostElementRequiredDiagnostic(
	ownerTagName: string | null,
	value: AnyNode,
	state: Pick<WalkState, 'filename' | 'source'>,
): SemanticGraphDiagnostic {
	const source = expressionSource(value, state.source);
	const owner = ownerTagName ? `<${ownerTagName}>` : 'a non-host element';

	return {
		code: 'AA_USE_HOST_ELEMENT_REQUIRED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'use can only be bound to host elements',
		message: `Cannot bind use={${source}} on component ${owner}. use installs DOM behavior and needs a concrete host element owner.`,
		why: 'Element behaviors are resumed by locating the owning DOM element. A component is not a DOM locator and may render zero, one, or many host nodes.',
		primarySpan: sourceSpan(value, state.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Move use={...} to a host element such as <canvas>, or make the component forward behavior to a known host element in its own TSRX body.',
			},
		],
		docsUrl: 'https://async.await.dev/errors/AA_USE_HOST_ELEMENT_REQUIRED',
	};
}

export function fallbackSpan(filename: string): SourceSpan {
	return {
		filename,
		start: 0,
		end: 0,
	};
}
