import { Hono } from "hono";
import type {
  Controller,
  ControllerApp,
  Method,
  RoutePattern,
  RouteTable,
  Site,
  SiteSetup,
} from "./types";

interface RegisteredRoute<Deps> {
  readonly method: Method;
  readonly path: string;
  readonly controller: Controller<Deps>;
}

const methods = new Set<Method>([
  "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD",
]);

function parseRoute(pattern: RoutePattern): { method: Method; path: string } {
  const separator = pattern.indexOf(" ");
  const method = pattern.slice(0, separator) as Method;
  const path = pattern.slice(separator + 1);

  if (!methods.has(method) || !path.startsWith("/")) {
    throw new Error(`Invalid route pattern: ${pattern}`);
  }

  return { method, path };
}

/** Create a Hono application whose routes are closure-first controllers. */
export function site<Deps>(setup: (context: SiteSetup<Deps>) => Deps): Site {
  const app = new Hono();
  const registered: RegisteredRoute<Deps>[] = [];

  const routes = (table: RouteTable<Deps>) => {
    for (const [pattern, controller] of Object.entries(table)) {
      if (!controller) continue;
      const { method, path } = parseRoute(pattern as RoutePattern);
      registered.push({ method, path, controller });
    }
  };

  const deps = setup({ app, routes });
  const controllerApp: ControllerApp<Deps> = { deps };

  for (const route of registered) {
    app.on(route.method, route.path, context =>
      route.controller(controllerApp, context));
  }

  return app;
}
