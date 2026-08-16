const hidden = "./secret";

export function loadOpaque(): unknown {
  // Intentionally unresolvable: keto must not invent a silent edge.
  return require(hidden);
}
