/**
 * Parse `.agentsmesh/files/**` into whole-file templates copied to the repo root.
 *
 * `dot_gitignore` maps to `.gitignore` so a live ignore file never hides templates.
 * Local-only helpers `.gitignore.prepend` / `.gitignore.append` are not templates.
 */

import { relative, join } from 'node:path';
import { lstat } from 'node:fs/promises';
import type { CanonicalTemplateFile } from '../../core/canonical-types.js';
import { exists, readFileSafe, readDirRecursiveNoSymlinks } from '../../utils/filesystem/fs.js';

/** Local-only join helpers — never emitted as outputs. */
const GITIGNORE_HELPERS = new Set(['.gitignore.prepend', '.gitignore.append']);

/**
 * Map a path relative to the files directory onto its repo-root output path.
 * Basename `dot_gitignore` → `.gitignore` (any directory depth).
 */
export function templateOutputPath(relPosix: string): string | null {
  const parts = relPosix.split('/');
  const leaf = parts[parts.length - 1] ?? '';
  if (GITIGNORE_HELPERS.has(leaf)) return null;
  if (leaf === 'dot_gitignore') {
    parts[parts.length - 1] = '.gitignore';
    return parts.join('/');
  }
  return relPosix;
}

/**
 * Parse all template files under `filesDir`.
 * @param filesDir - Absolute path to `.agentsmesh/files`
 */
export async function parseFiles(filesDir: string): Promise<CanonicalTemplateFile[]> {
  if (!(await exists(filesDir))) return [];
  const absFiles = await readDirRecursiveNoSymlinks(filesDir);
  const out: CanonicalTemplateFile[] = [];

  for (const abs of absFiles) {
    const rel = relative(filesDir, abs).replaceAll('\\', '/');
    if (!rel || rel.endsWith('/')) continue;
    const outputPath = templateOutputPath(rel);
    if (outputPath === null) continue;
    if (outputPath.startsWith('/') || outputPath.split('/').includes('..')) continue;

    const content = await readFileSafe(abs);
    if (content === null) continue;
    const info = await lstat(abs);
    out.push({
      path: outputPath,
      source: abs,
      content,
      mode: info.mode & 0o777,
    });
  }

  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** Read optional local gitignore join helpers from the project's files dir. */
export async function readGitignoreHelpers(
  projectRoot: string,
): Promise<{ prepend: string | null; append: string | null }> {
  const filesDir = join(projectRoot, '.agentsmesh', 'files');
  return {
    prepend: await readFileSafe(join(filesDir, '.gitignore.prepend')),
    append: await readFileSafe(join(filesDir, '.gitignore.append')),
  };
}

/**
 * Join local prepend + central content + local append with newlines.
 * Omitted parts leave no extra blank lines.
 */
export function joinGitignoreContent(
  prepend: string | null,
  central: string,
  append: string | null,
): string {
  const parts: string[] = [];
  if (prepend !== null && prepend.length > 0) parts.push(trimTrailingNewlines(prepend));
  parts.push(trimTrailingNewlines(central));
  if (append !== null && append.length > 0) parts.push(trimTrailingNewlines(append));
  return `${parts.join('\n')}\n`;
}

function trimTrailingNewlines(s: string): string {
  return s.replace(/(?:\r?\n)+$/u, '');
}
