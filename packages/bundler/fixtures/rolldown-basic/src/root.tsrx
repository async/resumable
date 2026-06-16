import { state } from '@async/resumable';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
