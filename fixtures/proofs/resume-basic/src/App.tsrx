type ItemDetails = {
  id: string;
  title: string;
  summary: string;
};

function markProofPanel(label: string) {
  return (element: HTMLElement) => {
    element.dataset.resumeProof = label;

    return () => {
      delete element.dataset.resumeProof;
    };
  };
}

async function fetchItemDetails(id: string, signal: AbortSignal): Promise<ItemDetails> {
  const response = await fetch(`/api/items/${id}`, { signal });

  if (!response.ok) {
    throw new Error("Failed to load item details");
  }

  return await response.json();
}

export function App() @{
  let count = state(0);
  const menu = state({
    open: true,
    query: "",
    selectedId: "alpha",
    lastAction: "initial",
  });
  let searchInput = element<HTMLInputElement>();

  const doubled = computed(() => count * 2);
  const panelLabel = computed(() => menu.open ? "menu-open" : "menu-closed");
  const details = computed(async ({ signal }) => {
    const id = menu.selectedId;

    return await fetchItemDetails(id, signal);
  });

  <main>
    <section use={markProofPanel(panelLabel)}>
      <button
        type="button"
        onClick={() => {
          count++;
          menu.lastAction = "incremented";
        }}
      >
        Count {count}{" / "}{doubled}
      </button>

      <input
        el={searchInput}
        value={menu.query}
        onInput={(event) => {
          menu.query = event.currentTarget.value;
          menu.open = true;
        }}
        onKeyDown={(event) => {
          if (menu.open && event.key === "Escape") {
            event.preventDefault();
            menu.open = false;
            menu.lastAction = "closed-by-escape";
          }
        }}
      />

      <button
        type="button"
        onClick={() => {
          searchInput?.focus();
          menu.lastAction = "focused-search";
        }}
      >
        Focus search
      </button>

      @if (menu.open) {
        <p>Menu is open for {menu.query || "all items"}</p>
      }

      @try {
        <article data-selected-id={details.id}>
          <h2>{details.title}</h2>
          <p>{details.summary}</p>
        </article>
      } @pending {
        <p>Loading item details</p>
      } @catch (err) {
        <p>Could not load item details: {err.message}</p>
      }

      <output>{menu.lastAction}</output>
    </section>
  </main>
}
