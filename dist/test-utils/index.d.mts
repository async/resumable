import { o as ProtocolViewPayload, r as ProtocolStatePayload } from "../index-CkXNK4ag.mjs";

//#region packages/test-utils/src/index.d.ts
type PayloadScriptPair = {
  readonly stateScript: string;
  readonly viewScript: string;
};
declare function assertPayloadScriptTypes(input: PayloadScriptPair): void;
declare function summarizeProtocolPayload(input: {
  readonly state: ProtocolStatePayload;
  readonly view: ProtocolViewPayload;
}): {
  readonly cells: number;
  readonly locators: number;
  readonly events: number;
  readonly bindings: number;
  readonly behaviors: number;
};
//#endregion
export { PayloadScriptPair, assertPayloadScriptTypes, summarizeProtocolPayload };