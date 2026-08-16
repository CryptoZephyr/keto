import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { normalizePath } from "./identity.js";

const execFileAsync = promisify(execFile);

export async function changedFilesFromGit(
  repoRoot: string,
  baseRef: string,
): Promise<string[]> {
  const cwd = resolve(repoRoot);
  const { stdout } = await execFileAsync("git", ["diff", "--name-only", baseRef], {
    cwd,
    windowsHide: true,
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePath);
}

export async function changedFilesForRepo(
  gitRoot: string,
  repoRoot: string,
  baseRef: string,
): Promise<string[]> {
  const absGit = resolve(gitRoot);
  const absRepo = resolve(repoRoot);
  const prefix = normalizePath(
    absRepo === absGit ? "" : absRepo.slice(absGit.length).replace(/^[/\\]+/, ""),
  );
  try {
    const names = await changedFilesFromGit(absRepo, baseRef);
    if (names.length > 0 || absRepo === absGit) {
      return names;
    }
  } catch {
    // fall back to the parent git root
  }
  const fromRoot = await changedFilesFromGit(absGit, baseRef);
  if (!prefix) return fromRoot;
  return fromRoot
    .filter((path) => path === prefix || path.startsWith(`${prefix}/`))
    .map((path) => path.slice(prefix.length + 1))
    .filter(Boolean);
}

export function normalizeChanged(files: readonly string[]): string[] {
  return [...new Set(files.map(normalizePath))].sort();
}
