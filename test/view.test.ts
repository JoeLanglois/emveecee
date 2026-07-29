import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../src/view";
import type { ViewKeyFunction } from "../src/view";

beforeEach(() => document.body.replaceChildren());

describe("view", () => {
  it("allows attributes to be omitted", () => {
    render(["p.note", "No attributes object"], document.body);

    expect(document.body.innerHTML).toBe('<p class="note">No attributes object</p>');
  });

  it("renders Hiccup nodes, attributes, Emmet selectors, and nested arrays", () => {
    render([
      "main#app.shell",
      { "aria-label": "Demo", hidden: false },
      ["h1.title", "Hello"],
      [["p", "one"], null, false, ["p", { class: "extra" }, "two"]],
    ], document.body);

    expect(document.body.innerHTML).toBe(
      '<main aria-label="Demo" id="app" class="shell"><h1 class="title">Hello</h1><p>one</p><p class="extra">two</p></main>',
    );
  });

  it("diffs text and attributes while preserving compatible elements", () => {
    render(["button#save.primary", { title: "Old" }, "Save"], document.body);
    const button = document.querySelector("button")!;

    render(["button.secondary", { disabled: true }, "Saved"], document.body);

    expect(document.querySelector("button")).toBe(button);
    expect(button.className).toBe("secondary");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.textContent).toBe("Saved");
  });

  it("updates event listeners without accumulating old handlers", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(["button", { onClick: first }, "Go"], document.body);
    render(["button", { onClick: second }, "Go"], document.body);

    document.querySelector("button")!.dispatchEvent(new MouseEvent("click"));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("adds and removes children during a diff", () => {
    render([["i", "a"], ["i", "b"]], document.body);
    const first = document.querySelector("i")!;
    render([["i", "A"], null, ["i", "B"], ["i", "C"]], document.body);

    expect(document.querySelector("i")).toBe(first);
    expect(document.body.textContent).toBe("ABC");
  });

  it("reorders keyed children while preserving their DOM nodes", () => {
    render(["ul",
      ["li", { key: "a" }, "A"],
      ["li", { key: "b" }, "B"],
      ["li", { key: "c" }, "C"],
    ], document.body);
    const [a, b, c] = Array.from(document.querySelectorAll("li"));

    render(["ul",
      ["li", { key: "c" }, "C updated"],
      ["li", { key: "a" }, "A"],
      ["li", { key: "b" }, "B"],
    ], document.body);

    const reordered = Array.from(document.querySelectorAll("li"));
    expect(reordered).toEqual([c, a, b]);
    expect(reordered[0].textContent).toBe("C updated");
    expect(reordered[0].hasAttribute("key")).toBe(false);
  });

  it("derives child keys with a key function on the parent", () => {
    const byId: ViewKeyFunction = attributes => Number(attributes.id);
    render(["ol", { key: byId }, ["li", { id: 1 }, "one"], ["li", { id: 2 }, "two"]], document.body);
    const [one, two] = Array.from(document.querySelectorAll("li"));

    render(["ol", { key: byId }, ["li", { id: 2 }, "two"], ["li", { id: 1 }, "one"]], document.body);

    expect(Array.from(document.querySelectorAll("li"))).toEqual([two, one]);
  });

  it("rejects duplicate sibling keys", () => {
    expect(() => render(["ul",
      ["li", { key: "same" }, "A"],
      ["li", { key: "same" }, "B"],
    ], document.body)).toThrow("View keys must be unique among siblings");
  });
});
