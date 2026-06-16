import { resumeFromPayloadDocument } from '../../../../resumable/src/runtime.ts';
import { loadSymbol } from './root.tsrx';

type ResumeContainerEventInput = {
	readonly root: Element;
	readonly event: Event;
};

const resumedContainers = new WeakMap<Element, ReturnType<typeof resumeFromPayloadDocument>>();

export async function resumeContainerEvent(input: ResumeContainerEventInput): Promise<void> {
	let resumed = resumedContainers.get(input.root);
	if (!resumed) {
		resumed = resumeFromPayloadDocument({
			document: input.root as never,
			root: input.root as never,
			loadSymbol,
		});
		resumedContainers.set(input.root, resumed);
	}

	const container = await resumed;
	await container.runtime.dispatch(input.event as never);
}
