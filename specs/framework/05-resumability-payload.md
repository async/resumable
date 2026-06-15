# Resumability Payload

Serialization tiers, compact state/view data scripts, payload arenas, and DOM locator materialization.

### Serialization tiers

Serialization is for durable graph state, not runtime resources. `computed()`
and `use={...}` deliberately remove most expensive cases from the serializer:
derived values are recreated, and DOM-backed libraries are owned by the host
node that uses them.

The serializer checks reachable graph values in this order:

1. **Built-ins** — primitives, plain objects, arrays, `Date`, `RegExp`, `Map`,
   `Set`, `URL`, `BigInt`, typed arrays, and `ArrayBuffer`. Object identity and
   cycles are preserved across the whole serialized graph.
2. **Framework graph values** — `state()` references, `shared()` roots, async
   snapshots, code references, event references, element handles, and behavior
   references. These serialize as framework IDs/locators, not as user objects.
3. **App-owned value classes** — importable classes defined in app source whose
   durable state is represented by serializable own fields. Methods are code,
   not data, so method bodies are never serialized.
4. **Third-party value classes** — importable third-party classes with
   serializable own fields and prototype methods that do not depend on hidden
   constructor-only state. These use the same restore path as app-owned classes.
5. **Recreated values** — derived objects that should not be durable state belong
   in `computed()`. The serialized graph stores their dependencies, then rebuilds
   the value lazily after resume.
6. **DOM/resource behavior** — values that need a live element, browser API,
   observer, editor, chart, map, canvas context, worker, socket, or cleanup
   belong in `use={...}` or host/meta-framework code. The serializer stores
   only the behavior code reference and serializable inputs.
7. **Unsupported values** — private hidden state, WeakMap-only state, live DOM
   nodes, request objects, secrets, DB clients, streams, native handles, and
   other values that cannot be restored from safe durable data.

Class restoration is prototype restoration, not constructor re-execution. For an
app-owned or third-party value class, the runtime imports the class and restores
the instance as if it had done:

```ts
const instance = Object.create(Class.prototype);
Object.assign(instance, serializedOwnFields);
```

Constructors do not run during resume. Public own fields are durable data;
prototype methods are imported behavior. Private fields are only supported when
they are initialized from serialized public state by an explicit library adapter
or by recreating the value in `computed()`. `toJSON()`/`fromJSON()` may be used by
library adapters, but ad hoc class serialization is not the default authoring
model.

If a class wraps DOM or runtime resources, it is not a value class. Put the
resource setup on the host element with `use={...}` or recreate it from
serializable state.

### Serialization payload

The initial render phase emits, alongside the HTML:

1. **State values** — object state serializes with the tiered serializer above.
   Sync `computed()` values are _not_ serialized; they re-derive lazily from
   their dependencies on first read.
2. **Async snapshots** — demanded async computed IDs, dependency keys, request
   versions, status (`pending`, `resolved`, `rejected`), and settled value/error
   data when available. This prevents resume from refetching data the initial
   render already resolved.
3. **Shared instances** — shared definition IDs, request/container/page scope,
   version counters, and the plain state snapshot for each touched shared
   instance. Methods/actions are never serialized.
4. **Subscription graph** — which symbol (binding, computed, async dependency
   key) depends on which state path.
5. **Wiring** — DOM element → event → optional sync event policy plus ordered
   symbol list for listeners, and DOM element → binding-symbol map for dynamic
   text/attributes/async boundaries.
6. **Element handles** — `element()` handle IDs mapped to DOM locators emitted by
   `el={handle}` bindings. The payload identifies where the element is; it never
   serializes the element object itself.
7. **Element behaviors** — host element locators mapped to ordered behavior
   symbol IDs and serialized behavior inputs from `use={...}`. The payload never
   serializes the behavior result, DOM-backed class instance, observer, editor,
   map, chart, canvas context, or cleanup function.

State and shared snapshots use an identity table, not naive JSON tree cloning.
Every serializable object, array, collection, or restorable class instance gets a
payload ID. Repeated references encode that ID, and cyclic graphs allocate shells
first before fields/entries are filled. This preserves object identity while
still rejecting unsupported values at their exact graph path.

Payloads are specified as logical arenas, not as public object-shaped JSON:

1. **State arena** — graph cells, typed roots, object/collection/class refs,
   async snapshots, shared snapshots, constants, backrefs, and forward refs.
2. **View/wiring arena** — DOM locator stream, listener symbol IDs, sync event
   policies, binding records, element handle locators, async boundary anchors,
   and `use={...}` host metadata.

Production payloads should encode all arena data into compact private data
scripts, rather than relying on verbose JSON objects or scattered per-node
attributes. By default, the core renderer emits two inert data scripts:

```html
<script type="async/state">
	...
</script>
<script type="async/view">
	...
</script>
```

`async/state` carries the state arena. `async/view` carries the view/wiring
arena. The renderer may merge, split, or stream these payloads when the
resumer/runtime protocol supports it, but these two script types are the
canonical core containers and the names used by documentation, devtools, and
diagnostics. Token alphabets, tag IDs, table layouts, and compression choices
inside those scripts are private render/resume protocol.

The production wire format should optimize for HTML size and parse cost:
typed tables or arenas, small numeric/string tags, root IDs, backrefs/forward
refs, and DOM-order skip runs for static nodes are all expected tools. The
view/wiring arena encodes metadata for the existing DOM; it is not a public
VNode format and does not imply a client VDOM or component re-render path.

### View locator materialization

The v1 `async/view` locator model uses a browser-native `TreeWalker` over
`ELEMENT` and `COMMENT` nodes to materialize encoded DOM-order records onto the
existing initially-rendered DOM. This is a locator-decoding step only:

```txt
async/view locator stream
-> TreeWalker over existing DOM
-> skip static nodes and ignored/nested regions
-> attach records to real elements/comment anchors
```

The resumer stores the result in internal side tables such as:

```ts
WeakMap<Element, EventRecord | BindingRecord | BehaviorRecord>;
Map<number, Comment>;
```

Element records attach to real DOM elements. Comment records are reserved for
dynamic anchors such as branches, keyed lists, async boundaries, fragments, and
streamed/patch segments. Static nodes should have no per-node attributes and no
runtime record.

This is deliberately not VDOM recovery. The `TreeWalker` pass does not
materialize component VNodes, child VNode trees, or client render functions. It
only maps compact `async/view` metadata to existing DOM nodes so later graph
writes, events, visibility triggers, and behavior setup can address those nodes
directly.

Development output must remain debuggable. Dev mode may emit a more readable
encoding, but production compactness remains the contract. The runtime and tools
must provide a decoded human-readable dump of the private payload so authors can
inspect why state, listeners, sync policies, bindings, or element behaviors were
included.
