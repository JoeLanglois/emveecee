import type {
  ControllerFunction,
} from "./types";

export function ctrl<Deps>(controller: ControllerFunction<Deps>): ControllerFunction<Deps> {
  return controller;
}
