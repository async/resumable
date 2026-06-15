import { o as ProtocolViewPayload, r as ProtocolStatePayload } from "./index-CkXNK4ag.mjs";

//#region packages/serializer/src/payload-scripts.d.ts
type RenderPayloadScriptsInput = {
  readonly state: ProtocolStatePayload;
  readonly view: ProtocolViewPayload;
};
type RenderedPayloadScripts = {
  readonly state: ProtocolStatePayload;
  readonly view: ProtocolViewPayload;
  readonly stateScript: string;
  readonly viewScript: string;
};
declare function renderPayloadScripts(input: RenderPayloadScriptsInput): RenderedPayloadScripts;
//#endregion
//#region packages/serializer/src/protocol-state.d.ts
type ProtocolStatePayloadInput = {
  readonly cells: ReadonlyArray<{
    readonly bindingId: string;
    readonly name: string;
    readonly valueKind: 'scalar' | 'object' | 'array' | 'unknown';
    readonly value: unknown;
  }>;
  readonly computed?: ProtocolStatePayload['computed'];
};
declare function createProtocolStatePayload(input: ProtocolStatePayloadInput): ProtocolStatePayload;
//#endregion
//#region packages/serializer/src/value.d.ts
type SerializedPrimitive = null | string | number | boolean | {
  readonly $type: 'undefined';
} | {
  readonly $type: 'bigint';
  readonly value: string;
};
type SerializedSlot = SerializedPrimitive | {
  readonly $ref: number;
} | {
  readonly $type: 'date';
  readonly value: string;
} | {
  readonly $type: 'regexp';
  readonly source: string;
  readonly flags: string;
} | {
  readonly $type: 'url';
  readonly value: string;
};
type SerializedRecord = {
  readonly id: number;
  readonly type: 'object';
  readonly fields: ReadonlyArray<readonly [string, SerializedSlot]>;
} | {
  readonly id: number;
  readonly type: 'array';
  readonly items: ReadonlyArray<SerializedSlot>;
} | {
  readonly id: number;
  readonly type: 'map';
  readonly entries: ReadonlyArray<readonly [SerializedSlot, SerializedSlot]>;
} | {
  readonly id: number;
  readonly type: 'set';
  readonly values: ReadonlyArray<SerializedSlot>;
} | {
  readonly id: number;
  readonly type: 'date';
  readonly value: string;
} | {
  readonly id: number;
  readonly type: 'regexp';
  readonly source: string;
  readonly flags: string;
} | {
  readonly id: number;
  readonly type: 'url';
  readonly value: string;
} | {
  readonly id: number;
  readonly type: 'array-buffer';
  readonly bytes: ReadonlyArray<number>;
} | {
  readonly id: number;
  readonly type: 'typed-array';
  readonly arrayType: TypedArrayName;
  readonly buffer: SerializedSlot;
  readonly byteOffset: number;
  readonly length: number;
};
type TypedArrayName = 'Int8Array' | 'Uint8Array' | 'Uint8ClampedArray' | 'Int16Array' | 'Uint16Array' | 'Int32Array' | 'Uint32Array' | 'Float32Array' | 'Float64Array' | 'BigInt64Array' | 'BigUint64Array';
type SerializedGraphPayload = {
  readonly version: 1;
  readonly root: SerializedSlot;
  readonly records: ReadonlyArray<SerializedRecord>;
};
type SerializationDiagnostic = {
  readonly code: 'AA_SERIALIZE_UNSUPPORTED_VALUE';
  readonly severity: 'error';
  readonly phase: 'serialization';
  readonly title: 'Cannot serialize graph state value';
  readonly path: ReadonlyArray<string>;
  readonly statePath: string;
  readonly valueKind: string;
  readonly message: string;
  readonly why: string;
  readonly suggestions: ReadonlyArray<{
    readonly message: string;
  }>;
  readonly docsUrl: string;
};
type SerializationResult = {
  readonly ok: true;
  readonly payload: SerializedGraphPayload;
  readonly diagnostics: readonly [];
} | {
  readonly ok: false;
  readonly diagnostics: ReadonlyArray<SerializationDiagnostic>;
};
declare function serializeGraphValue(value: unknown): SerializationResult;
declare function deserializeGraphValue(payload: SerializedGraphPayload): unknown;
//#endregion
export { SerializedRecord as a, deserializeGraphValue as c, createProtocolStatePayload as d, RenderPayloadScriptsInput as f, SerializedPrimitive as i, serializeGraphValue as l, renderPayloadScripts as m, SerializationResult as n, SerializedSlot as o, RenderedPayloadScripts as p, SerializedGraphPayload as r, TypedArrayName as s, SerializationDiagnostic as t, ProtocolStatePayloadInput as u };