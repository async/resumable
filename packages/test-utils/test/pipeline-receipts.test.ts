import { expect, test } from 'vitest';
import { createPipelineReceiptLog, summarizePipelineReceipts } from '../src/pipeline-receipts.ts';

test('pipeline receipt helpers keep build/dev/HMR evidence inspectable', () => {
	const log = createPipelineReceiptLog();

	log.record({
		stage: 'compiler-transform',
		moduleId: 'fixtures/proofs/bundler-pipeline/src/App.tsrx',
		inspectable: true,
		summary: 'compiler produced transform artifact',
		details: { virtualModules: 3, chunks: 3 },
	});
	log.record({
		stage: 'hmr-update',
		moduleId: 'fixtures/proofs/bundler-pipeline/src/App.tsrx',
		inspectable: true,
		summary: 'manifest refreshed after edit',
		details: { refreshedManifest: true },
	});

	expect(log.all()).toHaveLength(2);
	expect(summarizePipelineReceipts(log.all())).toEqual({
		total: 2,
		stages: ['compiler-transform', 'hmr-update'],
		modules: ['fixtures/proofs/bundler-pipeline/src/App.tsrx'],
		inspectable: true,
	});
});
