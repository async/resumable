import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const fixtureRoot = resolve(import.meta.dirname, '../fixtures');
const tsrxFixtureImports = [
	{
		path: 'rolldown-basic/src/root.tsrx',
		importLine: "import { state } from '@async/resumable';",
	},
	{
		path: 'vite-csr/src/root.tsrx',
		importLine: "import { state } from '@async/resumable';",
	},
	{
		path: 'vite-library/src/card.tsrx',
		importLine: "import { state } from '@async/resumable';",
	},
	{
		path: 'vite-plus/src/root.tsrx',
		importLine: "import { state } from '@async/resumable';",
	},
	{
		path: 'vite-ssr/src/root.tsrx',
		importLine: "import { state, computed } from '@async/resumable';",
	},
] as const;

describe('fixture framework boundaries', () => {
	test('TSRX fixtures import framework APIs explicitly', async () => {
		for (const fixture of tsrxFixtureImports) {
			await expect(readFixture(fixture.path)).resolves.toContain(fixture.importLine);
		}
	});

	test('browser entries delegate payload resume to runtime helpers', async () => {
		const csrEntry = await readFixture('vite-csr/src/main.ts');
		const ssrEntry = await readFixture('vite-ssr/src/entry-client.ts');

		for (const source of [csrEntry, ssrEntry]) {
			expect(source).not.toContain('data-async-host');
			expect(source).not.toContain('asyncHost');
			expect(source).not.toContain('querySelectorAll');
			expect(source).not.toContain('applyDomJournalRecords');
			expect(source).not.toContain('applyDomJournal');
		}
		expect(ssrEntry).toContain('resumeFromPayloadDocument');
	});

	test('server shell does not emit public per-node async host markers', async () => {
		const renderShell = await readFixture('vite-ssr/src/render-shell.ts');

		expect(renderShell).not.toContain('data-async-host');
		expect(renderShell).not.toContain('hostId');
	});

	test('SSR fixture config keeps framework compilation out of app config', async () => {
		const config = await readFixture('vite-ssr/vite.config.ts');

		expect(config).not.toContain('node:fs');
		expect(config).not.toContain('compileTsrxModule');
		expect(config).not.toContain('ssrLoadModule');
		expect(config).not.toContain('transformIndexHtml');
		expect(config).not.toContain('renderServerShell');
		expect(config).not.toContain('consumer:');
		expect(config).not.toContain('outDir:');
		expect(config).not.toContain('entryFileNames:');
		expect(config).toContain("input: 'src/entry-server.ts'");
	});

	test('SSR fixture advertises an interactive dev command', async () => {
		const packageJson = JSON.parse(await readFixture('vite-ssr/package.json')) as {
			scripts?: Record<string, string>;
		};

		expect(packageJson.scripts?.dev).toBe('vite --mode ssr');
	});

	test('SSR fixture advertises the real Vite app build command', async () => {
		const packageJson = JSON.parse(await readFixture('vite-ssr/package.json')) as {
			scripts?: Record<string, string>;
		};

		expect(packageJson.scripts?.build).toBe('vite build --app');
	});

	test('SSR preview box uses built app output without rewriting preview HTML', async () => {
		const box = await readBox('ssr-preview.box.ts');

		expect(box).not.toContain('pathToFileURL');
		expect(box).not.toContain('nativeImport');
		expect(box).not.toContain('project.edit');
		expect(box).not.toContain('render?.');
		expect(box).not.toContain('serverHtml');
	});
});

function readFixture(path: string): Promise<string> {
	return readFile(resolve(fixtureRoot, path), 'utf8');
}

function readBox(path: string): Promise<string> {
	return readFile(resolve(import.meta.dirname, '../boxes', path), 'utf8');
}
