import { fromB } from "./cycle-b";

export function fromA(): string {
  return `A:${fromB.length}`;
}
