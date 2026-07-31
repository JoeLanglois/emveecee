import { describe, expect, it } from "vitest";
import { site } from "../src";
import { liveReload } from "../src/dev";

describe("liveReload", () => {
  function application(options = {}) {
    return site(({ app, routes }) => {
      app.use("*", liveReload(options));
      routes({
        "GET /": (_app, context) =>
          context.html("<!doctype html><html><body><h1>Home</h1></body></html>"),
        "GET /fragment": (_app, context) => context.html("<p>Fragment</p>"),
        "GET /text": (_app, context) => context.text("plain"),
      });
      return {};
    });
  }

  it("injects its client into full HTML responses", async () => {
    const response = await application().request("/");
    const body = await response.text();

    expect(body).toContain('<script type="module" src="/__site/client.js" data-site-live-reload></script></body>');
    expect(response.headers.get("Content-Length")).toBeNull();
  });

  it("serves an uncached version and browser client", async () => {
    const app = application({ interval: 250 });
    const version = await app.request("/__site/version");
    const client = await app.request("/__site/client.js");

    expect(version.headers.get("Cache-Control")).toBe("no-store");
    expect(await version.text()).toMatch(/^\d+-/);
    expect(client.headers.get("Content-Type")).toContain("text/javascript");
    expect(await client.text()).toContain("const interval=250");
  });

  it("does not alter non-HTML or HTMX responses", async () => {
    const app = application();
    const text = await app.request("/text");
    const fragment = await app.request("/fragment", {
      headers: { "HX-Request": "true" },
    });

    expect(await text.text()).toBe("plain");
    expect(await fragment.text()).toBe("<p>Fragment</p>");
  });

  it("validates its options", () => {
    expect(() => liveReload({ path: "__site" })).toThrow("must begin with /");
    expect(() => liveReload({ interval: 50 })).toThrow("at least 100ms");
  });
});
