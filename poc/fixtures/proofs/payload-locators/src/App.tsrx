type LocatorItem = {
  id: string;
  title: string;
  status: "ready" | "blocked";
  count: number;
};

type BehaviorOptions = {
  label: string;
  selectedId: string;
};

function markLocatorHost(options: BehaviorOptions) {
  return (element: HTMLElement) => {
    element.setAttribute("aria-label", `${options.label}:${options.selectedId}`);

    return () => {
      element.removeAttribute("aria-label");
    };
  };
}

function focusVisibleInput(enabled: boolean) {
  return (element: HTMLInputElement) => {
    if (enabled) {
      element.dataset.focusVisible = "true";
    }

    return () => {
      delete element.dataset.focusVisible;
    };
  };
}

export function App() @{
  const items = state<LocatorItem[]>([
    { id: "alpha", title: "Alpha", status: "ready", count: 1 },
    { id: "beta", title: "Beta", status: "blocked", count: 2 },
    { id: "gamma", title: "Gamma", status: "ready", count: 3 },
  ]);
  const view = state({
    open: true,
    filter: "",
    selectedId: "alpha",
    message: "DOM-order locators ready",
  });
  let filterInput = element<HTMLInputElement>();
  let detailsPanel = element<HTMLElement>();

  const selected = computed(() => {
    return items.find((item) => item.id === view.selectedId) ?? items[0];
  });
  const visibleItems = computed(() => {
    return items.filter((item) => item.title.toLowerCase().includes(view.filter));
  });
  const summary = computed(() => {
    return `${visibleItems.length} visible / ${items.length} total`;
  });

  <main>
    <header>
      <h1>{summary}</h1>
      <p>{view.message}</p>

      <label>
        Filter
        <input
          el={filterInput}
          attach={focusVisibleInput(view.open)}
          value={view.filter}
          onInput={(event) => {
            view.filter = event.currentTarget.value.trim().toLowerCase();
            view.message = `Filter changed to ${view.filter || "all"}`;
          }}
        />
      </label>

      <button
        type="button"
        onClick={() => {
          view.open = !view.open;
          view.message = view.open ? "Details opened" : "Details closed";
        }}
      >
        {view.open ? "Hide" : "Show"} details
      </button>
    </header>

    <section>
      <h2>Static shell</h2>
      <p>This static paragraph should be skipped by DOM-order locator planning.</p>
    </section>

    @if (view.open) {
      <section
        el={detailsPanel}
        attach={markLocatorHost({
          label: "selected-panel",
          selectedId: selected.id,
        })}
      >
        <h2>{selected.title}</h2>
        <p>Status: {selected.status}</p>
        <p>Count: {selected.count}</p>

        <button
          type="button"
          onClick={() => {
            detailsPanel?.scrollIntoView();
            view.message = `Focused ${selected.title}`;
          }}
        >
          Focus selected panel
        </button>
      </section>
    }

    <ol>
      @for (const item of visibleItems; index index; key item.id) {
        <li>
          <article attach={markLocatorHost({
            label: "item-row",
            selectedId: item.id,
          })}>
            <h3>{index + 1}. {item.title}</h3>
            <p>{item.status === "ready" ? "Ready" : "Blocked"} count {item.count}</p>

            <button
              type="button"
              onClick={() => {
                view.selectedId = item.id;
                view.message = `Selected ${item.title}`;
              }}
            >
              Select {item.title}
            </button>
          </article>
        </li>
      } @empty {
        <li>
          <p>No locator rows match {view.filter}</p>
        </li>
      }
    </ol>

    <footer>
      <button
        type="button"
        onClick={() => {
          filterInput?.focus();
          view.message = "Filter input focused";
        }}
      >
        Focus filter
      </button>
      <output>{view.message}</output>
    </footer>
  </main>
}
