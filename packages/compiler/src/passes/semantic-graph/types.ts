import type { AnyNode } from '../../ast/nodes.ts';
import type {
	SemanticComponent,
	SemanticElementHandleBinding,
	SemanticEvent,
	SemanticGraphAlias,
	SemanticGraphBinding,
	SemanticGraphDiagnostic,
	SemanticHostNode,
	SemanticLocalBinding,
	SemanticStateRead,
	SemanticStateWrite,
	SemanticTemplateRead,
} from '../../artifacts.ts';

export type MutableSemanticGraphArtifact = {
	passId: 'tsrx-semantic-graph';
	filename: string;
	components: SemanticComponent[];
	graphBindings: SemanticGraphBinding[];
	hostNodes: SemanticHostNode[];
	events: SemanticEvent[];
	behaviors: Array<{ readonly hostNodeId: string; readonly source: string }>;
	elementHandleBindings: SemanticElementHandleBinding[];
	localBindings: SemanticLocalBinding[];
	aliases: SemanticGraphAlias[];
	stateReads: SemanticStateRead[];
	templateReads: SemanticTemplateRead[];
	stateWrites: SemanticStateWrite[];
	asyncBoundaries: Array<{ readonly id: string }>;
	diagnostics: SemanticGraphDiagnostic[];
};

export type WalkState = {
	readonly filename: string;
	readonly source: string;
	readonly graph: MutableSemanticGraphArtifact;
	readonly hostIds: WeakMap<object, string>;
	currentHostNodeId: string | null;
	currentAsyncBoundaryId: string | null;
	nextHostId: number;
	nextEventId: number;
	nextBoundaryId: number;
};

export type SemanticGraphWalk = (node: AnyNode | null | undefined, state: WalkState) => void;

export function createMutableSemanticGraphArtifact(filename: string): MutableSemanticGraphArtifact {
	return {
		passId: 'tsrx-semantic-graph',
		filename,
		components: [],
		graphBindings: [],
		hostNodes: [],
		events: [],
		behaviors: [],
		elementHandleBindings: [],
		localBindings: [],
		aliases: [],
		stateReads: [],
		templateReads: [],
		stateWrites: [],
		asyncBoundaries: [],
		diagnostics: [],
	};
}

export function createWalkState(input: {
	readonly filename: string;
	readonly source: string;
	readonly graph: MutableSemanticGraphArtifact;
}): WalkState {
	return {
		filename: input.filename,
		source: input.source,
		graph: input.graph,
		hostIds: new WeakMap<object, string>(),
		currentHostNodeId: null,
		currentAsyncBoundaryId: null,
		nextHostId: 0,
		nextEventId: 0,
		nextBoundaryId: 0,
	};
}

export type ModuleScopeDeclarationNode = AnyNode;
