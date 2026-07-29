export type RouteParams = Readonly<Record<string, string>>;

export interface Route {
  readonly path: string;
  readonly params: RouteParams;
  readonly query: URLSearchParams;
  readonly signal: AbortSignal;
}

export interface NavigateOptions {
  readonly replace?: boolean;
  readonly state?: unknown;
}

export interface ControllerLifecycle {
  load(route: Route): void | Promise<void>;
  unload?(): void | Promise<void>;
}

export interface ControllerApp<Deps> {
  readonly target: HTMLElement;
  readonly deps: Deps;
  readonly router: Router<Deps>;
  navigate(path: string, options?: NavigateOptions): Promise<void>;
}

export type Controller<Deps> = (
  app: ControllerApp<Deps>,
) => ControllerLifecycle;

export interface Router<Deps> {
  route(pattern: string, controller: Controller<Deps>): Router<Deps>;
  navigate(path: string, options?: NavigateOptions): Promise<void>;
}

export interface ApplicationSetup<Deps> {
  readonly router: Router<Deps>;
}

export interface Application<Deps> extends ControllerApp<Deps> {
  start(target: HTMLElement): Application<Deps>;
  stop(): Promise<void>;
}
