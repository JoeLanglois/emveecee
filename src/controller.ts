import type {
  Controller,
} from "./types";

export function ctrl<Deps>(controller: Controller<Deps>): Controller<Deps> {
  return controller;
}
