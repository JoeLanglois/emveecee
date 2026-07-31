import { describe, expect, it, vi } from "vitest";
import { ctrl, site, wrap } from "../src";
import type { Context } from "../src";

type Deps = {
  greeting: string;
};

describe("site", () => {
  it("serves a controller with application dependencies", async () => {
    const home = ctrl<Deps>((app, context) =>
      context.html(`<h1>${app.deps.greeting}</h1>`),
    );
    const app = site<Deps>(({ routes }) => {
      routes({ "GET /": home });
      return { greeting: "Hello world!" };
    });

    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<h1>Hello world!</h1>");
  });

  it("uses Hono routing and context directly", async () => {
    const app = site<Deps>(({ routes }) => {
      routes({
        "GET /products/:id": (_app, context) =>
          context.text(`${context.req.param("id")}:${context.req.query("sort")}`),
      });
      return { greeting: "Hello" };
    });

    const response = await app.request("/products/42?sort=price");

    expect(await response.text()).toBe("42:price");
  });

  it("calls the controller for every request", async () => {
    const controller = vi.fn(() => new Response("ok"));
    const app = site<Deps>(({ routes }) => {
      routes({ "GET /": controller });
      return { greeting: "Hello" };
    });

    await app.request("/");
    await app.request("/");

    expect(controller).toHaveBeenCalledTimes(2);
  });

  it("supports native Hono middleware", async () => {
    const app = site<Deps>(({ app, routes }) => {
      app.use("*", async (context, next) => {
        await next();
        context.header("X-Site", "yes");
      });
      routes({ "GET /": (_app, context) => context.text("ok") });
      return { greeting: "Hello" };
    });

    const response = await app.request("/");

    expect(response.headers.get("X-Site")).toBe("yes");
  });

  it("wraps individual controllers", async () => {
    const requireToken = wrap<Deps>(next => (app, context) => {
      if (context.req.header("Authorization") !== "Bearer secret") {
        return context.text("Unauthorized", 401);
      }
      return next(app, context);
    });
    const privatePage = requireToken(
      ctrl<Deps>((_app, context) => context.text("Private")),
    );
    const app = site<Deps>(({ routes }) => {
      routes({ "GET /private": privatePage });
      return { greeting: "Hello" };
    });

    expect((await app.request("/private")).status).toBe(401);
    expect(await (await app.request("/private", {
      headers: { Authorization: "Bearer secret" },
    })).text()).toBe("Private");
  });

  it("rejects malformed route patterns", () => {
    expect(() => site<Deps>(({ routes }) => {
      routes({ "GET products": (_app: never, context: Context) => context.text("no") } as never);
      return { greeting: "Hello" };
    })).toThrow("Invalid route pattern: GET products");
  });
});
