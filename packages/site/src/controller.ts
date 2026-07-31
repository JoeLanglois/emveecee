import type { Controller, ControllerWrapper } from "./types";

/** Provide contextual typing for a controller factory. */
export function ctrl<Deps>(controller: Controller<Deps>): Controller<Deps> {
  return controller;
}

/** Create a reusable wrapper for individual controllers. */
export function wrap<Deps>(wrapper: ControllerWrapper<Deps>) {
  return (controller: Controller<Deps>): Controller<Deps> =>
    wrapper(controller);
}
