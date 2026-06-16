import { resumeFromPayloadDocument } from '@async/resumable/runtime/resume';
import { loadSymbol } from './root.tsrx';

type ResumeContainerEventInput = {
	readonly root: Element;
	readonly event: Event;
};

type ResumedRoot = Element & {
	__asyncResumeRuntimeStarted?: boolean;
};

const resumedContainers = new WeakMap<Element, ReturnType<typeof resumeFromPayloadDocument>>();

export async function resumeContainerEvent(input: ResumeContainerEventInput): Promise<void> {
	const root = input.root as ResumedRoot;
	let resumed = resumedContainers.get(root);
	if (!resumed) {
		resumed = resumeFromPayloadDocument({
			document: root as never,
			root: root as never,
			loadSymbol,
		});
		resumedContainers.set(root, resumed);
	}

	const container = await resumed;
	root.__asyncResumeRuntimeStarted = true;
	await container.runtime.dispatch(input.event as never, { syncPolicyAlreadyApplied: true });
}
