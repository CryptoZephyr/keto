import { tokenFor } from "./auth";

export function greet(user: string): string {
  return `${user}:${tokenFor(user)}`;
}
