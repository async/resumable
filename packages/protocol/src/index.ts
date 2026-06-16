export const ASYNC_PROTOCOL_VERSION = 1;

export type ProtocolSyncPolicyCondition =
	| {
			readonly type: 'and';
			readonly conditions: ReadonlyArray<ProtocolSyncPolicyCondition>;
	  }
	| {
			readonly type: 'or';
			readonly conditions: ReadonlyArray<ProtocolSyncPolicyCondition>;
	  }
	| {
			readonly type: 'not';
			readonly condition: ProtocolSyncPolicyCondition;
	  }
	| {
			readonly type: 'graph-truthy';
			readonly graphNodeId: string;
			readonly path?: ReadonlyArray<string>;
	  }
	| {
			readonly type: 'constant-truthy';
			readonly value: unknown;
	  }
	| {
			readonly type: 'event-equals';
			readonly field: string;
			readonly value: unknown;
	  };

export type ProtocolSyncPolicyBranch = {
	readonly when: ProtocolSyncPolicyCondition;
	readonly actions: ReadonlyArray<'preventDefault' | 'stopPropagation'>;
};

export type ProtocolSyncPolicy =
	| ProtocolSyncPolicyBranch
	| {
			readonly branches: ReadonlyArray<ProtocolSyncPolicyBranch>;
	  };

export type ProtocolStatePayload = {
	readonly version: typeof ASYNC_PROTOCOL_VERSION;
	readonly cells: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly name: string;
		readonly valueKind: 'scalar' | 'object' | 'array' | 'unknown';
		readonly value?: unknown;
	}>;
	readonly computed: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly name: string;
		readonly async: boolean;
	}>;
};

export type ProtocolViewPayload = {
	readonly version: typeof ASYNC_PROTOCOL_VERSION;
	readonly locators: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly strategy: 'dom-order';
		readonly index: number;
		readonly tagName: string;
	}>;
	readonly events: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly syncPolicy?: ProtocolSyncPolicy;
		readonly symbolIds: ReadonlyArray<string>;
	}>;
	readonly domUpdates: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly source: string;
		readonly graphNodeId: string;
		readonly path: ReadonlyArray<string>;
		readonly target?:
			| {
					readonly kind: 'text';
			  }
			| {
					readonly kind: 'attribute';
					readonly name: string;
			  }
			| {
					readonly kind: 'property';
					readonly name: string;
			  }
			| {
					readonly kind: 'class';
			  }
			| {
					readonly kind: 'style';
			  };
		readonly symbolId?: string;
	}>;
	readonly behaviors: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly source: string;
		readonly symbolId?: string;
	}>;
	readonly elementHandles: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly handleId: string;
		readonly name: string;
	}>;
	readonly asyncBoundaries: ReadonlyArray<{
		readonly id: string;
		readonly startAnchor: {
			readonly strategy: 'dom-order-comment';
			readonly index: number;
		};
		readonly endAnchor: {
			readonly strategy: 'dom-order-comment';
			readonly index: number;
		};
		readonly asyncReads: ReadonlyArray<{
			readonly source: string;
			readonly graphNodeId: string;
			readonly path: ReadonlyArray<string>;
			readonly runnerSymbolId?: string;
		}>;
	}>;
};

export type ProtocolPayloadScripts = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly stateScript: string;
	readonly viewScript: string;
};
