/**
 * Generate the native `files` feature: copy templates to the repo root once,
 * outside the per-target loop. `.gitignore` joins local prepend/append helpers.
 */

import { join } from 'node:path';
import { lstat } from 'node:fs/promises';
import type { CanonicalFiles, GenerateResult } from '../types.js';
import { readFileSafe } from '../../utils/filesystem/fs.js';
import {
  joinGitignoreContent,
  readGitignoreHelpers,
} from '../../canonical/features/files.js';
import { computeStatus } from './feature-loop.js';

/** Synthetic target id for lock/output attribution (not a tool target). */
export const FILES_TARGET_ID = 'files';

async function statusForFile(
  projectRoot: string,
  relPath: string,
  content: string,
  mode: number | undefined,
): Promise<GenerateResult['status']> {
  const abs = join(projectRoot, relPath);
  const existing = await readFileSafe(abs);
  if (existing === null) return 'created';
  if (existing !== content) return 'updated';
  if (mode === undefined) return 'unchanged';
  try {
    const info = await lstat(abs);
    if ((info.mode & 0o777) !== (mode & 0o777)) return 'updated';
  } catch {
    return 'updated';
  }
  return 'unchanged';
}

/**
 * Emit one GenerateResult per canonical template file.
 * Mutates `results` in place (same pattern as optional-features).
 */
export async function generateFilesFeature(
  results: GenerateResult[],
  canonical: CanonicalFiles,
  projectRoot: string,
): Promise<void> {
  const templates = canonical.files ?? [];
  if (templates.length === 0) return;

  const helpers = await readGitignoreHelpers(projectRoot);

  for (const file of templates) {
    let content = file.content;
    if (file.path === '.gitignore') {
      content = joinGitignoreContent(helpers.prepend, file.content, helpers.append);
    }
    const existing = await readFileSafe(join(projectRoot, file.path));
    const status =
      file.mode !== undefined
        ? await statusForFile(projectRoot, file.path, content, file.mode)
        : computeStatus(existing, content);

    results.push({
      target: FILES_TARGET_ID,
      path: file.path,
      content,
      currentContent: existing ?? undefined,
      status,
      ...(file.mode !== undefined ? { mode: file.mode } : {}),
    });
  }
}

/** Paths currently emitted by the files feature (for lock `file_outputs`). */
export function fileOutputPaths(results: readonly GenerateResult[]): string[] {
  return results
    .filter((r) => r.target === FILES_TARGET_ID && r.status !== 'skipped')
    .map((r) => r.path.replaceAll('\\', '/'))
    .sort();
}
