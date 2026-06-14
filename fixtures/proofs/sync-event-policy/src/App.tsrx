type ShortcutState = {
  trapArrows: boolean;
  allowSubmit: boolean;
};

type MenuItem = {
  id: string;
  label: string;
};

function announceAction(action: string) {
  console.log(`[sync-event-policy] ${action}`);
}

export function App() @{
  const menu = state({
    open: true,
    activeIndex: 0,
    query: "",
    lastAction: "initial",
    items: [
      { id: "alpha", label: "Alpha" },
      { id: "beta", label: "Beta" },
      { id: "gamma", label: "Gamma" },
    ] satisfies MenuItem[],
  });
  const shortcuts = state<ShortcutState>({
    trapArrows: true,
    allowSubmit: false,
  });

  const activeItem = computed(() => menu.items[menu.activeIndex]);
  const status = computed(() => {
    const item = activeItem?.label ?? "none";

    return `${menu.open ? "open" : "closed"}:${item}:${menu.lastAction}`;
  });

  <main>
    <label>
      Search
      <input
        value={menu.query}
        onInput={(event) => {
          menu.query = event.currentTarget.value;
          menu.open = true;
          menu.lastAction = "query-updated";
        }}
        onKeyDown={(event) => {
          if (menu.open && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();

            menu.open = false;
            menu.lastAction = "closed-by-escape";
          }

          if (
            shortcuts.trapArrows &&
            (event.key === "ArrowDown" || event.key === "ArrowUp")
          ) {
            event.preventDefault();

            if (event.key === "ArrowDown") {
              menu.activeIndex++;
            } else {
              menu.activeIndex--;
            }

            menu.lastAction = "moved-by-arrow";
          }

          if (event.altKey && event.shiftKey && event.key === "K") {
            announceAction("keyboard-shortcut");
            menu.lastAction = "lazy-shortcut";
          }
        }}
      />
    </label>

    <button
      type="button"
      onClick={() => {
        shortcuts.trapArrows = !shortcuts.trapArrows;
        menu.lastAction = "toggled-arrow-trap";
      }}
    >
      Trap arrows: {shortcuts.trapArrows ? "on" : "off"}
    </button>

    <form
      onSubmit={(event) => {
        const values = new FormData(event.currentTarget);

        if (!shortcuts.allowSubmit && values.get("confirm") !== "yes") {
          // expected diagnostic: this guard reads DOM/runtime state through
          // FormData and event.currentTarget, so v1 cannot prove a sync
          // preventDefault policy from graph state plus event fields only.
          event.preventDefault();
          menu.lastAction = "blocked-submit";
        }
      }}
    >
      <input name="confirm" value={menu.query} />
      <button
        type="button"
        onClick={() => {
          shortcuts.allowSubmit = !shortcuts.allowSubmit;
          menu.lastAction = "toggled-submit";
        }}
      >
        Allow submit: {shortcuts.allowSubmit ? "yes" : "no"}
      </button>
      <button type="submit">Submit</button>
    </form>

    @if (menu.open) {
      <ul>
        @for (const item of menu.items; index index; key item.id) {
          <li data-active={index === menu.activeIndex}>
            {item.label}
          </li>
        }
      </ul>
    }

    <output>{status}</output>
  </main>
}
