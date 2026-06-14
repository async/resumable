import { createAsyncResumableRolldownPlugin } from '../../rolldown/src/index.ts';
import type { AsyncResumableRolldownTransformResult } from '../../rolldown/src/index.ts';
import type { PipelineManifest, PipelineReceipt } from '../../protocol/src/index.ts';

export type AsyncResumableHotUpdateContext = {
	readonly file: string;
	readonly read: () => string | Promise<string>;
};

export type AsyncResumableHotUpdateResult = {
	readonly moduleId: string;
	readonly refreshedManifest: true;
	readonly changedVirtualModules: ReadonlyArray<string>;
	readonly beforeRevision: number;
	readonly afterRevision: number;
	readonly transformed: boolean;
};

export type AsyncResumableVitePlugin = {
	readonly name: '@async/resumable/vite';
	readonly enforce: 'pre';
	readonly asyncResumable: {
		readonly compilerModel: 'rolldown-base-plugin';
		readonly usesSecondCompilerModel: false;
		readonly basePluginName: '@async/resumable/rolldown';
		readonly manifest: () => PipelineManifest;
		readonly receipts: () => ReadonlyArray<PipelineReceipt>;
	};
	readonly transform: (
		code: string,
		id: string,
	) => Promise<AsyncResumableRolldownTransformResult | null>;
	readonly load: (id: string) => Promise<string | null>;
	readonly handleHotUpdate: (
		context: AsyncResumableHotUpdateContext,
	) => Promise<AsyncResumableHotUpdateResult>;
};

export function createAsyncResumableVitePlugin(): AsyncResumableVitePlugin {
	const base = createAsyncResumableRolldownPlugin();
	const adapterReceipts: PipelineReceipt[] = [];

	return {
		name: '@async/resumable/vite',
		enforce: 'pre',
		asyncResumable: {
			compilerModel: 'rolldown-base-plugin',
			usesSecondCompilerModel: false,
			basePluginName: base.name,
			manifest: () => base.manifest(),
			receipts: () => [...base.receipts(), ...adapterReceipts],
		},
		async transform(code, id) {
			const result = await base.transform(code, id);

			if (result) {
				adapterReceipts.push({
					stage: 'vite-transform',
					moduleId: id,
					inspectable: true,
					summary:
						'Vite POC adapter delegated TSRX transform to the Rolldown base plugin.',
					details: {
						basePluginName: base.name,
						usesSecondCompilerModel: false,
					},
				});
			}

			return result;
		},
		load(id) {
			return base.load(id);
		},
		async handleHotUpdate(context) {
			const before = base.manifest();
			const beforeVirtualIds = new Set(before.virtualModules.map((module) => module.id));
			const source = await context.read();
			const result = await base.transform(source, context.file);
			const after = base.manifest();
			const afterVirtualIds = after.virtualModules.map((module) => module.id);
			const changedVirtualModules = afterVirtualIds.filter((id) => beforeVirtualIds.has(id));

			adapterReceipts.push({
				stage: 'hmr-update',
				moduleId: context.file,
				inspectable: true,
				summary:
					'Vite POC adapter refreshed transform and manifest records for an HMR edit.',
				details: {
					beforeRevision: before.revision,
					afterRevision: after.revision,
					refreshedManifest: true,
					changedVirtualModules,
				},
			});

			return {
				moduleId: context.file,
				refreshedManifest: true,
				changedVirtualModules,
				beforeRevision: before.revision,
				afterRevision: after.revision,
				transformed: result !== null,
			};
		},
	};
}
