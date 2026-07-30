# @jdlanglois/spa

A tiny, closure-first TypeScript library for single-page applications. It owns
routing and controller lifecycles, while your application owns its state,
models, services, and rendering technology.

## Install

```sh
npm install @jdlanglois/spa
```

## Usage

```ts
import { spa } from "@jdlanglois/spa";
import type { Controller, ControllerApp, Route } from "@jdlanglois/spa";

type AppDeps = {
  someService: SomeService;
};

const dashboardCtrl: Controller<AppDeps> = app => {
  async function load() {
    const message = await app.deps.someService.getMessage();
    app.target.innerHTML = `<h1>${message}</h1>`;
  }

  function unload() {
    app.target.replaceChildren();
  }

  return { load, unload };
};

const app = spa<AppDeps>(({ routes }) => {
  routes({ "/": dashboardCtrl });

  return {
    someService: new SomeService(),
  };
});

app.start(document.body);
```

Each route activation creates a new closure controller lifecycle or class
controller instance. Put page-local state there and application-wide state or
services in `app.deps`.

Controllers are ordinary functions. JavaScript needs no helper:

```js
const dashboardCtrl = app => ({
  load() {
    app.target.innerHTML = "<h1>Dashboard</h1>";
  },
});
```

TypeScript users who prefer contextual typing can optionally use `ctrl()`:

```ts
import { ctrl } from "@jdlanglois/spa";

const dashboardCtrl = ctrl<AppDeps>(app => ({
  load() {
    app.deps.someService.load();
  },
}));
```

## Routes

```ts
const productCtrl: Controller<AppDeps> = app => ({
  async load(route) {
    const product = await app.deps.someService.getProduct(
      route.params.id,
      { signal: route.signal },
    );

    if (!route.signal.aborted) {
      app.target.textContent = product.name;
    }
  },
}));

const app = spa<AppDeps>(({ routes }) => {
  routes({
    "/products/:id": productCtrl,
    "*": notFoundCtrl,
  });

  return { someService: new SomeService() };
});
```

The route passed to `load()` contains:

- `path`: the current pathname
- `params`: decoded named path parameters
- `query`: the native `URLSearchParams`
- `signal`: aborted when the controller is left

### Class controllers

Routes also accept controller classes. A new instance is constructed for each
activation, with the application passed to its constructor:

```ts
class SettingsCtrl {
  constructor(private readonly app: ControllerApp<AppDeps>) {}

  async load(route: Route) {
    const settings = await this.app.deps.someService.getSettings({
      signal: route.signal,
    });
    this.app.target.textContent = settings.title;
  }

  unload() {
    this.app.target.replaceChildren();
  }
}

const app = spa<AppDeps>(({ routes }) => {
  routes({ "/settings": SettingsCtrl });
  return { someService: new SomeService() };
});
```

Navigate programmatically with `app.navigate("/products/42")`. Links marked
with `data-route` are handled through the History API:

```html
<a href="/products/42" data-route>View product</a>
```

## Lifecycle

A controller must return `load` and may return `unload`:

```ts
const timerCtrl: Controller<AppDeps> = app => {
  let timer: ReturnType<typeof setInterval>;

  return {
    load() {
      timer = setInterval(render, 1000);
    },
    unload() {
      clearInterval(timer);
    },
  };
};
```

`app.stop()` removes navigation listeners, aborts the active route, and awaits
its `unload()` function.

## Views and redrawing

Views receive values and callbacks from their controller. The controller owns
the model, handles application behavior, and decides when a redraw is needed.
The view renders the values it receives and connects UI events to the supplied
callbacks.

The resulting one-way loop is:

```text
model -> controller render -> view -> callback -> model update -> render
```

A useful view contract is a target-bound renderer:

```ts
type View<Props> = {
  render(props: Props): void;
  dispose?(): void;
};

type CounterProps = {
  count: number;
  onIncrement(): void;
  onReset(): void;
};
```

The controller keeps its model private and passes the view only the values and
actions it needs:

```ts
const counterCtrl: Controller<AppDeps> = app => {
  const model = {
    count: 0,
  };

  const view = createCounterView(app.target);

  function render() {
    view.render({
      count: model.count,
      onIncrement,
      onReset,
    });
  }

  function onIncrement() {
    model.count++;
    render();
  }

  function onReset() {
    model.count = 0;
    render();
  }

  return {
    load: render,
    unload: () => view.dispose?.(),
  };
};
```

The library does not automatically redraw when a model changes. This keeps
models as ordinary objects and allows the controller to represent intermediate
states explicitly:

```ts
async function onSave() {
  model.saving = true;
  render();

  try {
    await app.deps.products.save(model.product);
  } finally {
    model.saving = false;
    render();
  }
}
```

### Direct DOM view

Replacing a view's subtree on each render also discards the old elements and
their event listeners:

```ts
function createCounterView(target: HTMLElement): View<CounterProps> {
  return {
    render(props) {
      const root = document.createElement("section");
      const count = document.createElement("p");
      const increment = document.createElement("button");
      const reset = document.createElement("button");

      count.textContent = `Count: ${props.count}`;
      increment.textContent = "Increment";
      reset.textContent = "Reset";

      increment.addEventListener("click", props.onIncrement);
      reset.addEventListener("click", props.onReset);
      root.append(count, increment, reset);
      target.replaceChildren(root);
    },

    dispose() {
      target.replaceChildren();
    },
  };
}
```

### Preact view

Preact keeps its render root associated with the target, so repeated calls to
`render()` update the existing component tree:

```ts
import { h, render as renderPreact } from "preact";

function createCounterView(target: HTMLElement): View<CounterProps> {
  return {
    render(props) {
      renderPreact(
        h("section", null,
          h("p", null, `Count: ${props.count}`),
          h("button", { onClick: props.onIncrement }, "Increment"),
          h("button", { onClick: props.onReset }, "Reset"),
        ),
        target,
      );
    },

    dispose() {
      renderPreact(null, target);
    },
  };
}
```

The same controller can use a JSX-based Preact view; the controller only cares
that the view implements `render()` and optionally `dispose()`.

### lit-html view

lit-html also preserves its rendering state between calls for the same target:

```ts
import { html, nothing, render as renderHtml } from "lit-html";

function createCounterView(target: HTMLElement): View<CounterProps> {
  return {
    render(props) {
      renderHtml(html`
        <section>
          <p>Count: ${props.count}</p>
          <button @click=${props.onIncrement}>Increment</button>
          <button @click=${props.onReset}>Reset</button>
        </section>
      `, target);
    },

    dispose() {
      renderHtml(nothing, target);
    },
  };
}
```

### Responsibility boundary

Controllers should:

- Own or load models and application state.
- Call services and handle route parameters.
- Define actions passed to the view.
- Handle loading, success, and error states.
- Decide when to render and dispose the active view.

Views should:

- Turn values into UI.
- Connect UI events to controller callbacks.
- Handle presentation-specific behavior such as focus or animation.
- Release resources owned by the rendering technology when disposed.

Views should call `props.onIncrement()` rather than mutating a controller model,
calling application services, or navigating directly. Intent-oriented callback
names such as `onIncrement` and `onSave` also keep views independent of whether
an action came from a click, keyboard shortcut, or another UI event.

## Philosophy

- View-library agnostic: use any rendering library or direct DOM manipulation.
- No model abstraction: ordinary JavaScript objects are enough.
- No automatic rendering: controllers decide when views are rendered.
- No classes or inheritance: applications and controllers are closures.
- No runtime dependencies.

## License

MIT
