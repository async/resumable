import { compileTsrxModule, type SymbolResolverModuleInput } from '@async/resumable-compiler';
import { normalize } from 'pathe';

export type ResumableRolldownPlugin = {
	readonly name: '@async/resumable/rolldown';
	readonly transform: (code: string, id: string) => Promise<{ readonly code: string } | null>;
	readonly load: (id: string) => string | null;
};

export type ResumableRolldownOptions = {
	readonly symbols: SymbolResolverModuleInput['symbols'];
};

export type TransformTsrxModuleInput = {
	readonly id: string;
	readonly code: string;
	readonly symbols: SymbolResolverModuleInput['symbols'];
};

export type ResumableVirtualModule = {
	readonly id: string;
	readonly kind: 'symbol-resolver' | 'payload';
	readonly code: string;
};

export type ResumableTransformManifest = {
	readonly moduleId: string;
	readonly symbolIds: ReadonlyArray<string>;
	readonly virtualModuleIds: ReadonlyArray<string>;
};

export type TransformTsrxModuleResult = {
	readonly id: string;
	readonly code: string;
	readonly virtualModules: ReadonlyArray<ResumableVirtualModule>;
	readonly manifest: ResumableTransformManifest;
};

export function asyncResumableRolldown(options: ResumableRolldownOptions): ResumableRolldownPlugin {
	const virtualModules = new Map<string, string>();

	return {
		name: '@async/resumable/rolldown',
		async transform(code, id) {
			const moduleId = normalizeTsrxModuleId(id);
			if (!moduleId) return null;

			const transformed = await transformTsrxModule({
				id: moduleId,
				code,
				symbols: options.symbols,
			});
			for (const virtualModule of transformed.virtualModules) {
				virtualModules.set(virtualModule.id, virtualModule.code);
			}

			return {
				code: transformed.code,
			};
		},
		load(id) {
			return virtualModules.get(id) ?? null;
		},
	};
}

export async function transformTsrxModule(
	input: TransformTsrxModuleInput,
): Promise<TransformTsrxModuleResult> {
	const moduleId = normalizeModulePath(input.id);
	const compiled = await compileTsrxModule({
		filename: moduleId,
		source: input.code,
		symbols: input.symbols,
	});
	const resolverId = `\0async-resumable/resolver:${moduleId}`;
	const payloadId = `\0async-resumable/payload:${moduleId}`;
	const virtualModules: ResumableVirtualModule[] = [
		{
			id: resolverId,
			kind: 'symbol-resolver',
			code: compiled.symbolResolverModule,
		},
		{
			id: payloadId,
			kind: 'payload',
			code: [
				`export const renderShell = ${templateLiteral(compiled.renderShell)};\n`,
				'export const state = ',
				JSON.stringify(compiled.protocolState),
				';\n',
				'export const view = ',
				JSON.stringify(compiled.protocolView),
				';\n',
			].join(''),
		},
	];
	const manifest: ResumableTransformManifest = {
		moduleId: input.id,
		symbolIds: input.symbols.map((symbol) => symbol.id),
		virtualModuleIds: virtualModules.map((module) => module.id),
	};

	return {
		id: moduleId,
		code: emitTransformedModule({
			source: moduleId,
			resolverId,
			payloadId,
			manifest,
		}),
		virtualModules,
		manifest,
	};
}

export function normalizeTsrxModuleId(id: string): string | null {
	const modulePath = normalizeModulePath(id);
	return modulePath.endsWith('.tsrx') ? modulePath : null;
}

function normalizeModulePath(id: string): string {
	return normalize(stripModuleIdSuffix(id));
}

function stripModuleIdSuffix(id: string): string {
	const queryIndex = id.indexOf('?');
	const hashIndex = id.indexOf('#');
	const suffixIndex = [queryIndex, hashIndex]
		.filter((index) => index >= 0)
		.sort((left, right) => left - right)[0];

	return suffixIndex === undefined ? id : id.slice(0, suffixIndex);
}

function emitTransformedModule(input: {
	readonly source: string;
	readonly resolverId: string;
	readonly payloadId: string;
	readonly manifest: ResumableTransformManifest;
}): string {
	return [
		'export const __async_resumable_module = ',
		JSON.stringify({
			source: input.source,
			resolver: input.resolverId,
			payload: input.payloadId,
			manifest: input.manifest,
		}),
		';\n',
	].join('');
}

function templateLiteral(value: string): string {
	return `\`${value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')}\``;
}
