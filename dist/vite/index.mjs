import { t as asyncResumableRolldown } from "../src-DXjDi3eF.mjs";
//#region packages/vite/src/index.ts
function asyncResumableVite(options) {
	const basePlugin = asyncResumableRolldown(options);
	return {
		name: "@async/resumable/vite",
		basePluginName: basePlugin.name,
		transform: basePlugin.transform,
		load: basePlugin.load
	};
}
//#endregion
export { asyncResumableVite };
