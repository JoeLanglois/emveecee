# @jdlanglois/site

A tiny closure-first controller layer for server-rendered Hono applications.
It owns controller construction and route registration. Hono owns HTTP,
middleware, routing, and responses. Your application owns rendering, layouts,
partial-response conventions, state, and services.

```sh
npm install @jdlanglois/site hono
```

```ts
import { ctrl, site } from "@jdlanglois/site";
import { html } from "@jdlanglois/view/server";

type AppDeps = {
  products: ProductService;
};

const product = ctrl<AppDeps>(async (app, context) => {
  const item = await app.deps.products.get(context.req.param("id"));
  const content = html(["article", ["h1", item.name]]);

  if (context.req.header("HX-Request") === "true") {
    return context.html(content);
  }

  return context.html(`<!doctype html><html><body>${content}</body></html>`);
});

const app = site<AppDeps>(({ app, routes }) => {
  // This is ordinary Hono middleware.
  app.use("*", async (context, next) => {
    await next();
    context.header("X-Frame-Options", "DENY");
  });

  routes({
    "GET /products/:id": product,
  });

  return { products: new ProductService() };
});

export default app;
```

Controllers receive the application dependencies and the ordinary Hono context
for each request, and can return any ordinary `Response`.

## Controller wrappers

Use Hono middleware for cross-cutting HTTP behavior. For behavior scoped to an
individual controller, `wrap()` creates a composable controller wrapper:

```ts
import { wrap } from "@jdlanglois/site";

const requireUser = wrap<AppDeps>(next => async (app, context) => {
  const user = await app.deps.sessions.user(context.req.raw);
  if (!user) return context.redirect("/sign-in");
  return next(app, context);
});

routes({
  "GET /account": requireUser(account),
});
```

The package deliberately has no layout, page, fragment, HTMX, redirect, or
rendering abstraction. Those decisions remain visible in controller code.

## Development live reload

The optional development entry injects a browser client into full HTML
responses. It reloads changed same-origin stylesheets without refreshing the
page and refreshes the page when a restarted server renders different HTML.

```ts
import { liveReload } from "@jdlanglois/site/dev";

const app = site<AppDeps>(({ app, routes }) => {
  app.use("*", liveReload());
  routes({ "GET /": home });
  return createDeps();
});
```

Run the application with the runtime's watcher:

```sh
bun --watch src/server.ts
deno run --watch --allow-net src/server.ts
```

The client polls in development, so linked CSS files are detected even when
they are not part of the server's imported module graph. HTMX requests are
excluded from script injection by default. The middleware is intentionally
available only from the `@jdlanglois/site/dev` entry point and should not be
registered in production.

Register live reload after middleware that transforms responses, such as
compression, so it can edit the uncompressed HTML before that middleware runs
on the way back out.
