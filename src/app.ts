import type {
  Application,
  ApplicationSetup,
  Controller,
  ControllerApp,
  ControllerLifecycle,
  NavigateOptions,
  Route,
  Router,
  RouteParams,
} from "./types";

interface RegisteredRoute<Deps> {
  readonly controller: Controller<Deps>;
  readonly match: (path: string) => RouteParams | undefined;
}

interface ActiveController {
  readonly lifecycle: ControllerLifecycle;
  readonly abort: AbortController;
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function compilePattern(pattern: string): (path: string) => RouteParams | undefined {
  if (pattern === "*") return () => ({});

  const names: string[] = [];
  const segments = pattern.split("/").map(segment => {
    if (!segment.startsWith(":")) return escapeRegExp(segment);

    const name = segment.slice(1);
    if (!name) throw new Error(`Invalid route pattern: ${pattern}`);
    names.push(name);
    return "([^/]+)";
  });
  const expression = new RegExp(`^${segments.join("/")}/?$`);

  return path => {
    const result = expression.exec(path);
    if (!result) return undefined;

    return Object.fromEntries(
      names.map((name, index) => [name, decodeURIComponent(result[index + 1])]),
    );
  };
}

function isRoutableClick(event: MouseEvent): HTMLAnchorElement | undefined {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return undefined;
  }

  const source = event.target;
  if (!(source instanceof Element)) return undefined;

  const anchor = source.closest<HTMLAnchorElement>("a[data-route]");
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
    return undefined;
  }

  const url = new URL(anchor.href, window.location.href);
  return url.origin === window.location.origin ? anchor : undefined;
}

export function createApp<Deps>(
  setup: (context: ApplicationSetup<Deps>) => Deps,
): Application<Deps> {
  const routes: RegisteredRoute<Deps>[] = [];
  let target: HTMLElement | undefined;
  let active: ActiveController | undefined;
  let started = false;
  let transition = 0;

  const router: Router<Deps> = {
    route(pattern, controller) {
      routes.push({ controller, match: compilePattern(pattern) });
      return router;
    },

    async navigate(path, options = {}) {
      ensureStarted();
      const url = new URL(path, window.location.href);

      if (url.origin !== window.location.origin) {
        throw new Error("Cannot navigate to a different origin");
      }

      const destination = `${url.pathname}${url.search}${url.hash}`;
      const method = options.replace ? "replaceState" : "pushState";
      window.history[method](options.state ?? null, "", destination);
      await activate(url);
    },
  };

  const deps = setup({ router });

  const app: Application<Deps> = {
    get target() {
      if (!target) throw new Error("Call app.start(target) before accessing target");
      return target;
    },
    deps,
    router,
    navigate: router.navigate,

    start(nextTarget) {
      if (started) throw new Error("Application has already been started");
      target = nextTarget;
      started = true;
      window.addEventListener("popstate", onPopState);
      document.addEventListener("click", onDocumentClick);
      void activate(new URL(window.location.href));
      return app;
    },

    async stop() {
      if (!started) return;
      started = false;
      transition++;
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onDocumentClick);
      await disposeActive();
      target = undefined;
    },
  };

  function ensureStarted() {
    if (!started) throw new Error("Call app.start(target) before navigating");
  }

  async function disposeActive() {
    const previous = active;
    active = undefined;
    if (!previous) return;
    previous.abort.abort();
    await previous.lifecycle.unload?.();
  }

  async function activate(url: URL) {
    const currentTransition = ++transition;
    await disposeActive();
    if (!started || currentTransition !== transition) return;

    let registered: RegisteredRoute<Deps> | undefined;
    let params: RouteParams | undefined;
    for (const candidate of routes) {
      const candidateParams = candidate.match(url.pathname);
      if (candidateParams !== undefined) {
        registered = candidate;
        params = candidateParams;
        break;
      }
    }

    if (!registered) {
      throw new Error(`No route matches ${url.pathname}`);
    }

    const abort = new AbortController();
    const controllerApp: ControllerApp<Deps> = app;
    const lifecycle = registered.controller(controllerApp);
    active = { lifecycle, abort };

    const route: Route = {
      path: url.pathname,
      params: params!,
      query: url.searchParams,
      signal: abort.signal,
    };

    try {
      await lifecycle.load(route);
    } catch (error) {
      if (!abort.signal.aborted) throw error;
    }
  }

  function onPopState() {
    void activate(new URL(window.location.href));
  }

  function onDocumentClick(event: MouseEvent) {
    const anchor = isRoutableClick(event);
    if (!anchor) return;
    event.preventDefault();
    void router.navigate(anchor.href);
  }

  return app;
}
