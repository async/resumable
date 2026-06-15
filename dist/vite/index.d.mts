import { s as asyncResumableRolldown, t as ResumableRolldownOptions } from "../index-DqKFMFQu.mjs";

//#region packages/vite/src/index.d.ts
type ResumableVitePlugin = {
  readonly name: '@async/resumable/vite';
  readonly basePluginName: '@async/resumable/rolldown';
  readonly transform: ReturnType<typeof asyncResumableRolldown>['transform'];
  readonly load: ReturnType<typeof asyncResumableRolldown>['load'];
};
declare function asyncResumableVite(options: ResumableRolldownOptions): ResumableVitePlugin;
//#endregion
export { ResumableVitePlugin, asyncResumableVite };