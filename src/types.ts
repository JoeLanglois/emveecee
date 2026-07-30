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
  readonly router: Router;
  navigate(path: string, options?: NavigateOptions): Promise<void>;
}

export type ControllerFunction<Deps> = (
  app: ControllerApp<Deps>,
) => ControllerLifecycle;

export interface ControllerClass<Deps> {
  new(app: ControllerApp<Deps>): ControllerLifecycle;
}

export type Controller<Deps> = ControllerFunction<Deps> | ControllerClass<Deps>;
export type RouteTable<Deps> = Readonly<Record<string, Controller<Deps>>>;
export type Routes<Deps> = (table: RouteTable<Deps>) => void;

export interface Router {
  navigate(path: string, options?: NavigateOptions): Promise<void>;
}

export interface ApplicationSetup<Deps> {
  readonly routes: Routes<Deps>;
}

export interface Application<Deps> extends ControllerApp<Deps> {
  start(target: HTMLElement): Application<Deps>;
  stop(): Promise<void>;
}
