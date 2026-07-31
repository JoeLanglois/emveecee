import type { Context, Hono } from "hono";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";
export type RoutePattern = `${Method} ${string}`;

export interface ControllerApp<Deps> {
  readonly deps: Deps;
}

export type Controller<Deps> = (
  app: ControllerApp<Deps>,
  context: Context,
) => Response | Promise<Response>;

export type ControllerWrapper<Deps> = (
  next: Controller<Deps>,
) => Controller<Deps>;

export type RouteTable<Deps> = Readonly<
  Partial<Record<RoutePattern, Controller<Deps>>>
>;

export type Routes<Deps> = (table: RouteTable<Deps>) => void;

export interface SiteSetup<Deps> {
  /** The underlying Hono application. Register middleware here before routes run. */
  readonly app: Hono;
  readonly routes: Routes<Deps>;
}

export type Site = Hono;

export type { Context, Hono };
