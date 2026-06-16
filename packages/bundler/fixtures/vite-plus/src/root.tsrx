import { state } from '@async/resumable';

export function Dashboard() @{
	let status = state("ready");

	<section>{status}</section>
}
