import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, test } from 'vitest';

const exec = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');

const fixtures = [
	{
		filter: '@fixtures/vite-csr',
		outputs: ['packages/bundler/fixtures/vite-csr/dist'],
		manifest: 'packages/bundler/fixtures/vite-csr/dist/async-resumable-manifest.json',
	},
	{
		filter: '@fixtures/vite-library',
		outputs: ['packages/bundler/fixtures/vite-library/dist'],
	},
	{
		filter: '@fixtures/vite-plus',
		outputs: ['packages/bundler/fixtures/vite-plus/dist'],
		manifest: 'packages/bundler/fixtures/vite-plus/dist/async-resumable-manifest.json',
	},
	{
		filter: '@fixtures/rolldown-basic',
		outputs: ['packages/bundler/fixtures/rolldown-basic/dist'],
		manifest:
			'packages/bundler/fixtures/rolldown-basic/dist/client/async-resumable-manifest.json',
	},
] as const;

describe('fixture builds', () => {
	beforeAll(async () => {
		await execPnpm(['build']);
	}, 120_000);

	for (const fixture of fixtures) {
		test(`${fixture.filter} builds from a clean output directory`, async () => {
			await Promise.all(
				fixture.outputs.map((output) =>
					rm(resolve(root, output), {
						force: true,
						recursive: true,
					}),
				),
			);

			await execPnpm(['--filter', fixture.filter, 'build']);

			if (fixture.manifest) {
				const manifest = JSON.parse(
					await readFile(resolve(root, fixture.manifest), 'utf8'),
				);
				expect(manifest.version).toBe(1);
				expect(manifest.modules).toEqual(expect.any(Array));
				expect(manifest.bundleGraphAsset).toBe('build/bundle-graph.json');
			}
		}, 120_000);
	}
});

async function execPnpm(args: string[]) {
	try {
		await exec('pnpm', args, { cwd: root });
	} catch (error) {
		const next = error as Error & { stdout?: string; stderr?: string };
		throw new Error([next.message, next.stdout, next.stderr].filter(Boolean).join('\n'));
	}
}
