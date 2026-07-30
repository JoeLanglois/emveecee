import { beforeEach, describe, expect, it, vi } from "vitest";
import { spa, ctrl } from "../src";
import type { Controller, ControllerApp, Route } from "../src";

type Deps = {
  greeting: string;
};

beforeEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/");
});

describe("application", () => {
  it("loads a controller with its application dependencies", async () => {
    const home = ctrl<Deps>(app => ({
      load() {
        app.target.textContent = app.deps.greeting;
      },
    }));

    const app = spa<Deps>(({ routes }) => {
      routes({ "/": home });
      return { greeting: "Hello world!" };
    });

    app.start(document.body);
    await vi.waitFor(() => expect(document.body.textContent).toBe("Hello world!"));
    await app.stop();
  });

  it("provides decoded parameters and query values", async () => {
    const load = vi.fn();
    const product: Controller<Deps> = () => ({ load });
    const app = spa<Deps>(({ routes }) => {
      routes({
        "/products/:id": product,
        "*": () => ({ load() {} }),
      });
      return { greeting: "Hello" };
    });

    app.start(document.body);
    await app.navigate("/products/hello%20world?sort=price");

    expect(load).toHaveBeenCalledOnce();
    const route = load.mock.calls[0][0];
    expect(route.params).toEqual({ id: "hello world" });
    expect(route.query.get("sort")).toBe("price");
    await app.stop();
  });

  it("unloads and aborts the previous controller", async () => {
    let previousSignal: AbortSignal | undefined;
    const unload = vi.fn();
    const first: Controller<Deps> = () => ({
      load(route) {
        previousSignal = route.signal;
      },
      unload,
    });
    const second: Controller<Deps> = () => ({ load() {} });
    const app = spa<Deps>(({ routes }) => {
      routes({ "/": first, "/next": second });
      return { greeting: "Hello" };
    });

    app.start(document.body);
    await vi.waitFor(() => expect(previousSignal).toBeDefined());
    await app.navigate("/next");

    expect(previousSignal?.aborted).toBe(true);
    expect(unload).toHaveBeenCalledOnce();
    await app.stop();
  });

  it("intercepts explicitly marked same-origin links", async () => {
    const nextLoad = vi.fn();
    const app = spa<Deps>(({ routes }) => {
      routes({
        "/": () => ({ load() {} }),
        "/next": () => ({ load: nextLoad }),
      });
      return { greeting: "Hello" };
    });
    const link = document.createElement("a");
    link.href = "/next";
    link.dataset.route = "";
    document.body.append(link);

    app.start(document.body);
    link.click();

    await vi.waitFor(() => expect(nextLoad).toHaveBeenCalledOnce());
    expect(window.location.pathname).toBe("/next");
    await app.stop();
  });

  it("constructs class controllers with the application and runs their lifecycle", async () => {
    const unload = vi.fn();

    class SettingsController {
      constructor(private readonly app: ControllerApp<Deps>) {}

      load(route: Route) {
        this.app.target.textContent = `${this.app.deps.greeting} ${route.path}`;
      }

      unload() {
        unload();
      }
    }

    const app = spa<Deps>(({ routes }) => {
      routes({
        "/": () => ({ load() {} }),
        "/settings": SettingsController,
      });
      return { greeting: "Hello" };
    });

    app.start(document.body);
    await app.navigate("/settings");
    expect(document.body.textContent).toBe("Hello /settings");
    await app.navigate("/");
    expect(unload).toHaveBeenCalledOnce();
    await app.stop();
  });
});
