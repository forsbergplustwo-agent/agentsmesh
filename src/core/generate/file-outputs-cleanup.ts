/**
 * Stale cleanup for native `files` outputs.
 *
 * Target managed-dir sweeps cannot see arbitrary repo-root paths (`mise.toml`,
 * `.gitignore`, …). The lock's `file_outputs` list is the provenance record:
 * previous paths missing from this run are deleted.
 */

import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { exists } from '../../utils/filesystem/fs.js';
import { assertPathInsideRoot } from '../../utils/filesystem/path-containment.js';

export interface FileOutputsCleanupArgs {
  readonly projectRoot: string;
  /** Paths the previous lock recorded under `file_outputs`. */
  readonly previous: readonly string[];
  /** Paths this run will (or did) emit for the files feature. */
  readonly expected: readonly string[];
}

/** Previous file_outputs not in `expected`, still present on disk. */
export async function findStaleFileOutputs(args: FileOutputsCleanupArgs): Promise<string[]> {
  const expected = new Set(args.expected.map((p) => p.replaceAll('\\', '/')));
  const found: string[] = [];
  for (const raw of args.previous) {
    const rel = raw.replaceAll('\\', '/');
    if (expected.has(rel)) continue;
    if (rel.startsWith('/') || rel.split('/').includes('..')) continue;
    const abs = join(args.projectRoot, rel);
    await assertPathInsideRoot(args.projectRoot, dirname(abs));
    if (await exists(abs)) found.push(rel);
  }
  return found.sort();
}

export async function cleanupStaleFileOutputs(args: FileOutputsCleanupArgs): Promise<void> {
  for (const rel of await findStaleFileOutputs(args)) {
    await rm(join(args.projectRoot, rel), { force: true });
  }
}
