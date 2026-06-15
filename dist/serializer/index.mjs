import "../protocol/index.mjs";
//#region packages/serializer/src/payload-scripts.ts
function renderPayloadScripts(input) {
	return {
		state: input.state,
		view: input.view,
		stateScript: renderDataScript("async/state", input.state),
		viewScript: renderDataScript("async/view", input.view)
	};
}
function renderDataScript(type, payload) {
	return `<script type="${type}">${escapeScriptJson(JSON.stringify(payload))}<\/script>`;
}
function escapeScriptJson(value) {
	return value.replace(/</g, "\\u003C");
}
//#endregion
//#region packages/serializer/src/value.ts
function serializeGraphValue(value) {
	const diagnostics = [];
	const seen = /* @__PURE__ */ new WeakMap();
	const records = [];
	const root = encodeSlot(value, [], seen, records, diagnostics);
	if (diagnostics.length > 0) return {
		ok: false,
		diagnostics
	};
	return {
		ok: true,
		payload: {
			version: 1,
			root,
			records
		},
		diagnostics: []
	};
}
function deserializeGraphValue(payload) {
	const shells = /* @__PURE__ */ new Map();
	for (const record of payload.records) {
		if (record.type === "object") shells.set(record.id, {});
		if (record.type === "array") shells.set(record.id, []);
		if (record.type === "map") shells.set(record.id, /* @__PURE__ */ new Map());
		if (record.type === "set") shells.set(record.id, /* @__PURE__ */ new Set());
		if (record.type === "date") shells.set(record.id, new Date(record.value));
		if (record.type === "regexp") shells.set(record.id, new RegExp(record.source, record.flags));
		if (record.type === "url") shells.set(record.id, new URL(record.value));
		if (record.type === "array-buffer") shells.set(record.id, new Uint8Array(record.bytes).buffer);
	}
	for (const record of payload.records) if (record.type === "typed-array") shells.set(record.id, createTypedArray(record, shells));
	for (const record of payload.records) {
		const shell = shells.get(record.id);
		if (record.type === "object") {
			const object = shell;
			for (const [key, slot] of record.fields) object[key] = decodeSlot(slot, shells);
		}
		if (record.type === "array") {
			const array = shell;
			for (const item of record.items) array.push(decodeSlot(item, shells));
		}
		if (record.type === "map") {
			const map = shell;
			for (const [key, value] of record.entries) map.set(decodeSlot(key, shells), decodeSlot(value, shells));
		}
		if (record.type === "set") {
			const set = shell;
			for (const value of record.values) set.add(decodeSlot(value, shells));
		}
	}
	return decodeSlot(payload.root, shells);
}
function encodeSlot(value, path, seen, records, diagnostics) {
	if (value === null) return null;
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
	if (typeof value === "undefined") return { $type: "undefined" };
	if (typeof value === "bigint") return {
		$type: "bigint",
		value: String(value)
	};
	if (typeof value === "function" || typeof value === "symbol") {
		diagnostics.push(unsupportedDiagnostic(value, path));
		return null;
	}
	if (!isObject(value)) {
		diagnostics.push(unsupportedDiagnostic(value, path));
		return null;
	}
	if (value instanceof Date) {
		const existingId = seen.get(value);
		if (existingId !== void 0) return { $ref: existingId };
		const id = records.length;
		seen.set(value, id);
		records.push({
			id,
			type: "date",
			value: value.toISOString()
		});
		return { $ref: id };
	}
	if (value instanceof RegExp) {
		const existingId = seen.get(value);
		if (existingId !== void 0) return { $ref: existingId };
		const id = records.length;
		seen.set(value, id);
		records.push({
			id,
			type: "regexp",
			source: value.source,
			flags: value.flags
		});
		return { $ref: id };
	}
	if (value instanceof URL) {
		const existingId = seen.get(value);
		if (existingId !== void 0) return { $ref: existingId };
		const id = records.length;
		seen.set(value, id);
		records.push({
			id,
			type: "url",
			value: value.toString()
		});
		return { $ref: id };
	}
	if (value instanceof ArrayBuffer) {
		const existingId = seen.get(value);
		if (existingId !== void 0) return { $ref: existingId };
		const id = records.length;
		seen.set(value, id);
		records.push({
			id,
			type: "array-buffer",
			bytes: [...new Uint8Array(value)]
		});
		return { $ref: id };
	}
	const arrayType = typedArrayName(value);
	if (arrayType) {
		const existingId = seen.get(value);
		if (existingId !== void 0) return { $ref: existingId };
		const id = records.length;
		seen.set(value, id);
		records.push({
			id,
			type: "typed-array",
			arrayType,
			buffer: encodeTypedArrayBuffer(value, path, seen, records, diagnostics),
			byteOffset: typedArrayByteOffset(value),
			length: typedArrayLength(value)
		});
		return { $ref: id };
	}
	const existingId = seen.get(value);
	if (existingId !== void 0) return { $ref: existingId };
	const id = records.length;
	seen.set(value, id);
	if (Array.isArray(value)) {
		const record = {
			id,
			type: "array",
			items: []
		};
		records.push(record);
		record.items.push(...value.map((item, index) => encodeSlot(item, [...path, String(index)], seen, records, diagnostics)).filter(isSerializedSlot));
		return { $ref: id };
	}
	if (value instanceof Map) {
		const record = {
			id,
			type: "map",
			entries: []
		};
		records.push(record);
		let index = 0;
		for (const [key, item] of value) {
			const keySlot = encodeSlot(key, [...path, `mapKey:${index}`], seen, records, diagnostics);
			const valueSlot = encodeSlot(item, [...path, `mapValue:${index}`], seen, records, diagnostics);
			if (keySlot && valueSlot) record.entries.push([keySlot, valueSlot]);
			index++;
		}
		return { $ref: id };
	}
	if (value instanceof Set) {
		const record = {
			id,
			type: "set",
			values: []
		};
		records.push(record);
		let index = 0;
		for (const item of value) {
			const slot = encodeSlot(item, [...path, `set:${index}`], seen, records, diagnostics);
			if (slot) record.values.push(slot);
			index++;
		}
		return { $ref: id };
	}
	const record = {
		id,
		type: "object",
		fields: []
	};
	records.push(record);
	for (const [key, item] of Object.entries(value)) {
		const slot = encodeSlot(item, [...path, key], seen, records, diagnostics);
		if (slot) record.fields.push([key, slot]);
	}
	return { $ref: id };
}
function decodeSlot(slot, shells) {
	if (slot === null || typeof slot === "string" || typeof slot === "number" || typeof slot === "boolean") return slot;
	if ("$ref" in slot) return shells.get(slot.$ref);
	if (slot.$type === "undefined") return void 0;
	if (slot.$type === "bigint") return BigInt(slot.value);
	if (slot.$type === "date") return new Date(slot.value);
	if (slot.$type === "regexp") return new RegExp(slot.source, slot.flags);
	if (slot.$type === "url") return new URL(slot.value);
}
function typedArrayName(value) {
	if (value instanceof Int8Array) return "Int8Array";
	if (value instanceof Uint8Array) return "Uint8Array";
	if (value instanceof Uint8ClampedArray) return "Uint8ClampedArray";
	if (value instanceof Int16Array) return "Int16Array";
	if (value instanceof Uint16Array) return "Uint16Array";
	if (value instanceof Int32Array) return "Int32Array";
	if (value instanceof Uint32Array) return "Uint32Array";
	if (value instanceof Float32Array) return "Float32Array";
	if (value instanceof Float64Array) return "Float64Array";
	if (typeof BigInt64Array !== "undefined" && value instanceof BigInt64Array) return "BigInt64Array";
	if (typeof BigUint64Array !== "undefined" && value instanceof BigUint64Array) return "BigUint64Array";
	return null;
}
function encodeTypedArrayBuffer(value, path, seen, records, diagnostics) {
	const buffer = value.buffer;
	if (!(buffer instanceof ArrayBuffer)) {
		diagnostics.push(unsupportedDiagnostic(buffer, [...path, "buffer"]));
		return null;
	}
	return encodeSlot(buffer, [...path, "buffer"], seen, records, diagnostics) ?? null;
}
function typedArrayByteOffset(value) {
	return value.byteOffset;
}
function typedArrayLength(value) {
	return value.length;
}
function createTypedArray(record, shells) {
	const buffer = decodeSlot(record.buffer, shells);
	if (!(buffer instanceof ArrayBuffer)) return void 0;
	if (record.arrayType === "Int8Array") return new Int8Array(buffer, record.byteOffset, record.length);
	if (record.arrayType === "Uint8Array") return new Uint8Array(buffer, record.byteOffset, record.length);
	if (record.arrayType === "Uint8ClampedArray") return new Uint8ClampedArray(buffer, record.byteOffset, record.length);
	if (record.arrayType === "Int16Array") return new Int16Array(buffer, record.byteOffset, record.length);
	if (record.arrayType === "Uint16Array") return new Uint16Array(buffer, record.byteOffset, record.length);
	if (record.arrayType === "Int32Array") return new Int32Array(buffer, record.byteOffset, record.length);
	if (record.arrayType === "Uint32Array") return new Uint32Array(buffer, record.byteOffset, record.length);
	if (record.arrayType === "Float32Array") return new Float32Array(buffer, record.byteOffset, record.length);
	if (record.arrayType === "Float64Array") return new Float64Array(buffer, record.byteOffset, record.length);
	if (record.arrayType === "BigInt64Array") return new BigInt64Array(buffer, record.byteOffset, record.length);
	return new BigUint64Array(buffer, record.byteOffset, record.length);
}
function unsupportedDiagnostic(value, path) {
	const valueKind = typeof value;
	return {
		code: "AA_SERIALIZE_UNSUPPORTED_VALUE",
		severity: "error",
		phase: "serialization",
		title: "Cannot serialize graph state value",
		path,
		statePath: formatPath(path),
		valueKind,
		message: `Cannot serialize value at ${formatPath(path)} because ${valueKind} values are not durable graph state.`,
		why: "Serialization is for durable graph state. Functions and host/runtime resources cannot be restored during resume.",
		suggestions: [{ message: "Move runtime resources into use={...}, make the value serializable state, or derive it with computed()." }],
		docsUrl: "https://async.await.dev/errors/AA_SERIALIZE_UNSUPPORTED_VALUE"
	};
}
function formatPath(path) {
	return path.length === 0 ? "<root>" : path.join(".");
}
function isObject(value) {
	return typeof value === "object" && value !== null;
}
function isSerializedSlot(value) {
	return value !== null;
}
//#endregion
//#region packages/serializer/src/protocol-state.ts
function createProtocolStatePayload(input) {
	return {
		version: 1,
		cells: input.cells.map((cell) => {
			const result = serializeGraphValue(cell.value);
			if (!result.ok) throw new Error(result.diagnostics[0]?.message ?? "Cannot serialize protocol state cell.");
			return {
				bindingId: cell.bindingId,
				name: cell.name,
				valueKind: cell.valueKind,
				value: result.payload
			};
		}),
		computed: input.computed ?? []
	};
}
//#endregion
export { createProtocolStatePayload, deserializeGraphValue, renderPayloadScripts, serializeGraphValue };
