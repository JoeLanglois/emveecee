export type ViewPrimitive = string | number | bigint;
export type ViewKey = string | number;
export type ViewKeyFunction = (
  attributes: ViewAttributes,
  index: number,
  view: View,
) => ViewKey;

export type ViewAttributeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | EventListener
  | ViewKeyFunction
  | Record<string, string | number | null | undefined>;

export type ViewAttributes = Record<string, ViewAttributeValue> & {
  /** A node identity, or a function deriving identities for this node's children. */
  key?: ViewKey | ViewKeyFunction;
};

export type View = ViewPrimitive | ViewNode | readonly View[] | null | undefined | false;

export type ViewNode = readonly [
  selector: string,
  attributesOrChild?: ViewAttributes | View,
  ...children: View[]
];

interface ElementDescription {
  tag: string;
  id?: string;
  classes: string[];
}

interface RenderState {
  view: View;
  nodes: Node[];
}

const states = new WeakMap<Node, RenderState>();
const listeners = new WeakMap<Element, Map<string, EventListener>>();

function isNode(value: View): value is ViewNode {
  return Array.isArray(value) && typeof value[0] === "string";
}

function isAttributes(value: unknown): value is ViewAttributes {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSelector(selector: string): ElementDescription {
  const match = /^([\w-]+)?((?:[.#][\w-]+)*)$/.exec(selector);
  if (!match) throw new Error(`Invalid view selector: ${selector}`);

  const suffixes = match[2].match(/[.#][\w-]+/g) ?? [];
  const ids = suffixes.filter(value => value[0] === "#");
  if (ids.length > 1) throw new Error(`A view selector can only contain one id: ${selector}`);

  return {
    tag: match[1] || "div",
    id: ids[0]?.slice(1),
    classes: suffixes.filter(value => value[0] === ".").map(value => value.slice(1)),
  };
}

function parts(view: ViewNode) {
  const candidate = view[1];
  return isAttributes(candidate)
    ? { attributes: candidate, children: view.slice(2) as View[] }
    : { attributes: {}, children: view.slice(1) as View[] };
}

function flattened(view: View): View[] {
  if (view === null || view === undefined || view === false) return [];
  if (!Array.isArray(view) || isNode(view)) return [view];
  return view.flatMap(child => flattened(child));
}

function childViews(view: ViewNode): View[] {
  return parts(view).children.flatMap(child => flattened(child));
}

function childKeyFunction(view: ViewNode): ViewKeyFunction | undefined {
  const key = parts(view).attributes.key;
  return typeof key === "function" ? key as ViewKeyFunction : undefined;
}

function viewKey(view: View, index: number, keyFunction?: ViewKeyFunction): ViewKey | undefined {
  if (isNode(view)) {
    const key = parts(view).attributes.key;
    if (typeof key === "string" || typeof key === "number") return key;
  }
  return keyFunction?.(isNode(view) ? parts(view).attributes : {}, index, view);
}

function setAttribute(element: Element, name: string, value: ViewAttributeValue) {
  if (name === "key") return;
  if (name.startsWith("on") && typeof value === "function") {
    const event = name.slice(2).toLowerCase();
    const listener = value as EventListener;
    const previous = listeners.get(element)?.get(event);
    if (previous !== listener) {
      if (previous) element.removeEventListener(event, previous);
      element.addEventListener(event, listener);
      const elementListeners = listeners.get(element) ?? new Map();
      elementListeners.set(event, listener);
      listeners.set(element, elementListeners);
    }
    return;
  }
  if (name === "style" && isAttributes(value)) {
    const style = (element as HTMLElement).style;
    style.cssText = "";
    for (const [property, propertyValue] of Object.entries(value)) {
      if (propertyValue != null) style.setProperty(property, String(propertyValue));
    }
    return;
  }
  if (value === false || value === null || value === undefined) {
    element.removeAttribute(name);
  } else if (value === true) {
    element.setAttribute(name, "");
  } else {
    element.setAttribute(name === "className" ? "class" : name, String(value));
  }
}

function removeAttribute(element: Element, name: string, oldValue: ViewAttributeValue) {
  if (name === "key") return;
  if (name.startsWith("on") && typeof oldValue === "function") {
    const event = name.slice(2).toLowerCase();
    element.removeEventListener(event, oldValue as EventListener);
    listeners.get(element)?.delete(event);
  } else {
    element.removeAttribute(name === "className" ? "class" : name);
  }
}

function effectiveAttributes(view: ViewNode): ViewAttributes {
  const selector = parseSelector(view[0]);
  const attributes = { ...parts(view).attributes };
  if (selector.id !== undefined && attributes.id === undefined) attributes.id = selector.id;
  if (selector.classes.length) {
    const explicit = attributes.class ?? attributes.className;
    attributes.class = [...selector.classes, ...(explicit ? [String(explicit)] : [])].join(" ");
    delete attributes.className;
  }
  return attributes;
}

function updateAttributes(element: Element, oldView: ViewNode | undefined, view: ViewNode) {
  const before = oldView ? effectiveAttributes(oldView) : {};
  const after = effectiveAttributes(view);
  for (const [name, value] of Object.entries(before)) {
    if (!(name in after)) removeAttribute(element, name, value);
  }
  for (const [name, value] of Object.entries(after)) {
    if (before[name] !== value) {
      if (name.startsWith("on") && typeof before[name] === "function") {
        removeAttribute(element, name, before[name]);
      }
      setAttribute(element, name, value);
    }
  }
}

function create(view: View): Node {
  if (!isNode(view)) return document.createTextNode(String(view));
  const description = parseSelector(view[0]);
  const element = document.createElement(description.tag);
  updateAttributes(element, undefined, view);
  const children = childViews(view);
  keysFor(children, childKeyFunction(view));
  for (const child of children) element.append(create(child));
  return element;
}

function compatible(node: Node, oldView: View, view: View) {
  if (isNode(oldView) && isNode(view)) {
    return node instanceof Element && parseSelector(oldView[0]).tag === parseSelector(view[0]).tag;
  }
  return !isNode(oldView) && !isNode(view) && node.nodeType === Node.TEXT_NODE;
}

function patch(parent: Node, node: Node, oldView: View, view: View): Node {
  if (!compatible(node, oldView, view)) {
    const replacement = create(view);
    parent.replaceChild(replacement, node);
    return replacement;
  }
  if (!isNode(view) || !isNode(oldView)) {
    const text = String(view);
    if (node.nodeValue !== text) node.nodeValue = text;
    return node;
  }

  const element = node as Element;
  updateAttributes(element, oldView, view);
  patchChildren(
    element,
    childViews(oldView),
    childViews(view),
    childKeyFunction(oldView),
    childKeyFunction(view),
  );
  return element;
}

function keysFor(children: View[], keyFunction?: ViewKeyFunction): ViewKey[] | undefined {
  if (children.length === 0) return [];
  const keys = children.map((child, index) => viewKey(child, index, keyFunction));
  if (keys.some(key => key === undefined)) return undefined;
  const complete = keys as ViewKey[];
  if (new Set(complete).size !== complete.length) {
    throw new Error("View keys must be unique among siblings");
  }
  return complete;
}

function patchKeyedChildren(
  parent: Node,
  oldChildren: View[],
  children: View[],
  oldKeys: ViewKey[],
  keys: ViewKey[],
) {
  const oldNodes = Array.from(parent.childNodes);
  const oldByKey = new Map(oldKeys.map((key, index) => [
    key,
    { node: oldNodes[index], view: oldChildren[index] },
  ]));
  const retained = new Set<Node>();

  for (let index = 0; index < children.length; index++) {
    const previous = oldByKey.get(keys[index]);
    const node = previous
      ? patch(parent, previous.node, previous.view, children[index])
      : create(children[index]);
    retained.add(node);
    const current = parent.childNodes[index];
    if (current !== node) parent.insertBefore(node, current ?? null);
  }

  for (const node of oldNodes) {
    if (!retained.has(node) && node.parentNode === parent) parent.removeChild(node);
  }
}

function patchChildren(
  parent: Node,
  oldChildren: View[],
  children: View[],
  oldKeyFunction?: ViewKeyFunction,
  keyFunction?: ViewKeyFunction,
) {
  const oldKeys = keysFor(oldChildren, oldKeyFunction);
  const keys = keysFor(children, keyFunction);
  if (oldKeys && keys && (oldKeys.length > 0 || keys.length > 0)) {
    patchKeyedChildren(parent, oldChildren, children, oldKeys, keys);
    return;
  }

  const common = Math.min(oldChildren.length, children.length);
  for (let index = 0; index < common; index++) {
    patch(parent, parent.childNodes[index], oldChildren[index], children[index]);
  }
  while (parent.childNodes.length > children.length) parent.lastChild?.remove();
  for (let index = common; index < children.length; index++) parent.appendChild(create(children[index]));
}

/** Render a Hiccup-style view into a target, diffing against its previous render. */
export function render(view: View, target: Element | DocumentFragment): void {
  const children = flattened(view);
  keysFor(children);
  const previous = states.get(target);
  const unchangedOutsideRender = previous?.nodes.every(
    (node, index) => target.childNodes[index] === node,
  ) && target.childNodes.length === previous.nodes.length;
  if (previous && unchangedOutsideRender) {
    patchChildren(target, flattened(previous.view), children);
  } else {
    target.replaceChildren(...children.map(create));
  }
  states.set(target, { view, nodes: Array.from(target.childNodes) });
}
