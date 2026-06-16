import { r as ProtocolStatePayload, s as ProtocolViewPayload } from "../index-Bi_snVSJ.mjs";

//#region packages/test-utils/src/index.d.ts
type PayloadScriptPair = {
  readonly stateScript: string;
  readonly viewScript: string;
};
type DecodedPayloadScriptPair = {
  readonly state: ProtocolStatePayload;
  readonly view: ProtocolViewPayload;
};
type ProtocolPayloadSummary = {
  readonly cells: number;
  readonly computed: number;
  readonly locators: number;
  readonly events: number;
  readonly bindings: number;
  readonly behaviors: number;
  readonly elementHandles: number;
  readonly asyncBoundaries: number;
};
type PayloadDebugDump = {
  readonly summary: ProtocolPayloadSummary;
  readonly state: {
    readonly version: ProtocolStatePayload['version'];
    readonly cells: ReadonlyArray<{
      readonly bindingId: string;
      readonly name: string;
      readonly valueKind: ProtocolStatePayload['cells'][number]['valueKind'];
    }>;
    readonly computed: ProtocolStatePayload['computed'];
  };
  readonly view: {
    readonly version: ProtocolViewPayload['version'];
    readonly locators: ReadonlyArray<{
      readonly hostNodeId: string;
      readonly index: number;
      readonly tagName: string;
    }>;
    readonly events: ReadonlyArray<{
      readonly hostNodeId: string;
      readonly eventName: string;
      readonly symbolIds: ReadonlyArray<string>;
      readonly hasSyncPolicy: boolean;
    }>;
    readonly bindings: ProtocolViewPayload['bindings'];
    readonly behaviors: ProtocolViewPayload['behaviors'];
    readonly elementHandles: ProtocolViewPayload['elementHandles'];
    readonly asyncBoundaries: ReadonlyArray<{
      readonly id: string;
      readonly startIndex: number;
      readonly endIndex: number;
      readonly asyncReads: ProtocolViewPayload['asyncBoundaries'][number]['asyncReads'];
    }>;
  };
};
declare function assertPayloadScriptTypes(input: PayloadScriptPair): void;
declare function decodePayloadScriptPair(input: PayloadScriptPair): DecodedPayloadScriptPair;
declare function summarizePayloadScripts(input: PayloadScriptPair): ProtocolPayloadSummary;
declare function createPayloadDebugDump(input: PayloadScriptPair): PayloadDebugDump;
declare function summarizeProtocolPayload(input: {
  readonly state: ProtocolStatePayload;
  readonly view: ProtocolViewPayload;
}): ProtocolPayloadSummary;
//#endregion
export { DecodedPayloadScriptPair, PayloadDebugDump, PayloadScriptPair, ProtocolPayloadSummary, assertPayloadScriptTypes, createPayloadDebugDump, decodePayloadScriptPair, summarizePayloadScripts, summarizeProtocolPayload };