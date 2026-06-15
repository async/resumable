import { $ as SymbolResolverModuleInput } from "./index-BF_iL1GV.mjs";

//#region packages/rolldown/src/index.d.ts
type ResumableRolldownPlugin = {
  readonly name: '@async/resumable/rolldown';
  readonly transform: (code: string, id: string) => Promise<{
    readonly code: string;
  } | null>;
  readonly load: (id: string) => string | null;
};
type ResumableRolldownOptions = {
  readonly symbols: SymbolResolverModuleInput['symbols'];
};
type TransformTsrxModuleInput = {
  readonly id: string;
  readonly code: string;
  readonly symbols: SymbolResolverModuleInput['symbols'];
};
type ResumableVirtualModule = {
  readonly id: string;
  readonly kind: 'symbol-resolver' | 'payload';
  readonly code: string;
};
type ResumableTransformManifest = {
  readonly moduleId: string;
  readonly symbolIds: ReadonlyArray<string>;
  readonly virtualModuleIds: ReadonlyArray<string>;
};
type TransformTsrxModuleResult = {
  readonly id: string;
  readonly code: string;
  readonly virtualModules: ReadonlyArray<ResumableVirtualModule>;
  readonly manifest: ResumableTransformManifest;
};
declare function asyncResumableRolldown(options: ResumableRolldownOptions): ResumableRolldownPlugin;
declare function transformTsrxModule(input: TransformTsrxModuleInput): Promise<TransformTsrxModuleResult>;
declare function normalizeTsrxModuleId(id: string): string | null;
//#endregion
export { TransformTsrxModuleInput as a, normalizeTsrxModuleId as c, ResumableVirtualModule as i, transformTsrxModule as l, ResumableRolldownPlugin as n, TransformTsrxModuleResult as o, ResumableTransformManifest as r, asyncResumableRolldown as s, ResumableRolldownOptions as t };