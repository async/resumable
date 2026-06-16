import { state } from '@async/resumable';

export function Card() @{
	let title = state("Library card");

	<article>{title}</article>
}
