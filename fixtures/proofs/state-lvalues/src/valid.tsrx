type Item = {
  id: string;
  label: string;
  done: boolean;
  meta: {
    edits: number;
  };
};

type StateLvaluesProps = {
  nextCount: number;
  nextX: number;
  nextTitle: string;
};

function createItem(id: string, label: string): Item {
  return {
    id,
    label,
    done: false,
    meta: {
      edits: 0,
    },
  };
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

export function App({ nextCount, nextX, nextTitle }: StateLvaluesProps) @{
  let count = state(0);
  const obj = state({
    x: 1,
    nested: {
      title: "Initial title",
      meta: {
        dirty: false,
        saves: 0,
      },
    },
    items: [
      createItem("alpha", "Alpha"),
      createItem("beta", "Beta"),
    ],
    tags: ["initial"],
  });

  const total = computed(() => count + obj.x + obj.items.length);
  const currentTitle = computed(() => `${obj.nested.title} (${obj.tags.length})`);
  const { nested } = obj;

  <main>
    <h1>{currentTitle}</h1>

    <button
      type="button"
      onClick={() => {
        count++;
        obj.x = count;
        obj.nested.meta.dirty = true;
      }}
    >
      Increment {count} and {total}
    </button>

    <button
      type="button"
      onClick={() => {
        count = nextCount;
        obj.x = nextX;
        obj.nested.title = nextTitle;
        obj.nested.meta.saves++;
      }}
    >
      Replace count and title
    </button>

    <input
      value={obj.nested.title}
      onInput={(event) => {
        nested.title = event.currentTarget.value;
        nested.meta.dirty = true;
        obj.tags[0] = normalizeLabel(event.currentTarget.value);
      }}
    />

    <button
      type="button"
      onClick={() => {
        const id = `item-${count}`;

        obj.items.push(createItem(id, `Item ${count}`));
        obj.items[0].label = `First ${count}`;
        obj.items[0].meta.edits++;
        obj.tags.push(`tag-${obj.tags.length}`);
      }}
    >
      Mutate array state
    </button>

    <ul>
      @for (const item of obj.items; index index; key item.id) {
        <li>
          <label>
            <input
              type="checkbox"
              checked={item.done}
              onChange={(event) => {
                obj.items[index].done = event.currentTarget.checked;
                obj.items[index].meta.edits++;
              }}
            />
            {item.label} ({item.meta.edits})
          </label>

          <button
            type="button"
            onClick={() => {
              obj.items[index].label = `${item.label}!`;
              obj.items[index].meta.edits++;
            }}
          >
            Rename
          </button>

          <button
            type="button"
            onClick={() => {
              obj.items.splice(index, 1);
            }}
          >
            Remove
          </button>
        </li>
      } @empty {
        <li>No items</li>
      }
    </ul>

    <output>
      Count {count}; x {obj.x}; nested {obj.nested.title}; saves
      {obj.nested.meta.saves}; tags {obj.tags.length}
    </output>
  </main>
}
