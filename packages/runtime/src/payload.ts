import {
	ASYNC_PROTOCOL_VERSION,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@async/resumable-protocol';
import { deserializeGraphValue, type SerializedGraphPayload } from '@async/resumable-serializer';
import { createRuntimeGraph, type RuntimeGraph } from './graph.ts';
import {
	createResumeRuntime,
	type ResumeDomElement,
	type ResumeRuntime,
	type ResumeRuntimeInput,
} from './resume.ts';

export type EncodedPayloadScripts = {
	readonly stateScript: string;
	readonly viewScript: string;
};

export type DecodedPayloadScripts = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};

export type ResumePayloadScriptsInput = EncodedPayloadScripts & {
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
};

export type ResumePayloadScriptsResult = {
	readonly decoded: DecodedPayloadScripts;
	readonly graph: RuntimeGraph;
	readonly runtime: ResumeRuntime;
};

export function decodePayloadScripts(input: EncodedPayloadScripts): DecodedPayloadScripts {
	const state = parseDataScript(input.stateScript, 'async/state') as ProtocolStatePayload;
	const view = parseDataScript(input.viewScript, 'async/view') as ProtocolViewPayload;

	assertProtocolVersion(state.version, 'async/state');
	assertProtocolVersion(view.version, 'async/view');

	return { state, view };
}

export function createRuntimeGraphFromStatePayload(payload: ProtocolStatePayload): RuntimeGraph {
	return createRuntimeGraph({
		cells: payload.cells.map((cell) => ({
			bindingId: cell.bindingId,
			value:
				cell.value === undefined
					? undefined
					: deserializeGraphValue(cell.value as SerializedGraphPayload),
		})),
	});
}

export async function resumeFromPayloadScripts(
	input: ResumePayloadScriptsInput,
): Promise<ResumePayloadScriptsResult> {
	const decoded = decodePayloadScripts(input);
	const graph = createRuntimeGraphFromStatePayload(decoded.state);
	const runtime = createResumeRuntime({
		root: input.root,
		graph,
		view: decoded.view,
		loadSymbol: input.loadSymbol,
	});

	await runtime.start();

	return {
		decoded,
		graph,
		runtime,
	};
}

function parseDataScript(script: string, type: 'async/state' | 'async/view'): unknown {
	const prefix = `<script type="${type}">`;
	const suffix = '</script>';

	if (!script.startsWith(prefix) || !script.endsWith(suffix)) {
		throw new Error(`Expected ${type} payload script.`);
	}

	return JSON.parse(script.slice(prefix.length, -suffix.length));
}

function assertProtocolVersion(version: unknown, type: 'async/state' | 'async/view'): void {
	if (version !== ASYNC_PROTOCOL_VERSION) {
		throw new Error(`Unsupported ${type} protocol version ${String(version)}.`);
	}
}
