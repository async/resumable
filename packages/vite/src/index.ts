import { asyncResumableRolldown, type ResumableRolldownOptions } from '@async/resumable-rolldown';

export type ResumableVitePlugin = {
	readonly name: '@async/resumable/vite';
	readonly basePluginName: '@async/resumable/rolldown';
	readonly transform: ReturnType<typeof asyncResumableRolldown>['transform'];
	readonly load: ReturnType<typeof asyncResumableRolldown>['load'];
};

export function asyncResumableVite(options: ResumableRolldownOptions): ResumableVitePlugin {
	const basePlugin = asyncResumableRolldown(options);

	return {
		name: '@async/resumable/vite',
		basePluginName: basePlugin.name,
		transform: basePlugin.transform,
		load: basePlugin.load,
	};
}
