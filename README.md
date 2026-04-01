# Matching Visualisations

This folder contains the interactive web tool developed alongside the dissertation.
It has two views:

- a Stable Roommates stepper that replays Irving's algorithm on complete strict instances
- a stable-marriage poset-to-preferences view for inspecting how small rotation posets are realised as preference lists

A deployed copy is available at:

- `https://matching-visualisations.wowcaeu-andreas.workers.dev/`

The source was maintained during development at:

- `https://github.com/arayias/matching-visualisations`

The submission copy is intended as a reusable starting point rather than a one-off demo. The matching logic lives under `src/lib`, the drawing code lives in `src/components`, and the main page is `src/routes/index.tsx`, so additional examples or new visual views can be added without changing the basic structure.

## Run locally

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The app runs on `http://localhost:3000`.

## Build

To build the production bundle:

```bash
npm run build
```

## Notes

- This submission includes the source code only. Generated folders such as `node_modules`, `dist`, and Cloudflare deployment state are not required.
- No automated test suite is included in this submission build. The `test` script therefore acts only as a placeholder.

Now let's create a simple counter in the `src/App.tsx` file as a demonstration.

```tsx
import { useStore } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import "./App.css";

const countStore = new Store(0);

function App() {
  const count = useStore(countStore);
  return (
    <div>
      <button onClick={() => countStore.setState((n) => n + 1)}>
        Increment - {count}
      </button>
    </div>
  );
}

export default App;
```

One of the many nice features of TanStack Store is the ability to derive state from other state. That derived state will update when the base state updates.

Let's check this out by doubling the count using derived state.

```tsx
import { useStore } from "@tanstack/react-store";
import { Store, Derived } from "@tanstack/store";
import "./App.css";

const countStore = new Store(0);

const doubledStore = new Derived({
  fn: () => countStore.state * 2,
  deps: [countStore],
});
doubledStore.mount();

function App() {
  const count = useStore(countStore);
  const doubledCount = useStore(doubledStore);

  return (
    <div>
      <button onClick={() => countStore.setState((n) => n + 1)}>
        Increment - {count}
      </button>
      <div>Doubled - {doubledCount}</div>
    </div>
  );
}

export default App;
```

We use the `Derived` class to create a new store that is derived from another store. The `Derived` class has a `mount` method that will start the derived store updating.

Once we've created the derived store we can use it in the `App` component just like we would any other store using the `useStore` hook.

You can find out everything you need to know on how to use TanStack Store in the [TanStack Store documentation](https://tanstack.com/store/latest).

# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.

# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).
