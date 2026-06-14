import type { PipelineReceipt } from '../../protocol/src/index.ts';

export type PipelineReceiptLog = {
	readonly record: (receipt: PipelineReceipt) => void;
	readonly all: () => ReadonlyArray<PipelineReceipt>;
};

export type PipelineReceiptSummary = {
	readonly total: number;
	readonly stages: ReadonlyArray<PipelineReceipt['stage']>;
	readonly modules: ReadonlyArray<string>;
	readonly inspectable: boolean;
};

export function createPipelineReceiptLog(): PipelineReceiptLog {
	const receipts: PipelineReceipt[] = [];

	return {
		record(receipt) {
			receipts.push(receipt);
		},
		all() {
			return [...receipts];
		},
	};
}

export function summarizePipelineReceipts(
	receipts: ReadonlyArray<PipelineReceipt>,
): PipelineReceiptSummary {
	return {
		total: receipts.length,
		stages: unique(receipts.map((receipt) => receipt.stage)),
		modules: unique(receipts.map((receipt) => receipt.moduleId)),
		inspectable: receipts.every((receipt) => receipt.inspectable),
	};
}

function unique<T>(values: ReadonlyArray<T>): T[] {
	return [...new Set(values)];
}
