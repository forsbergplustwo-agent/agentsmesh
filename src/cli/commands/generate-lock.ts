/**
 * Lock-file writing helper for the generate command.
 */

import { join } from 'node:path';
import {
  buildChecksums,
  buildExtendChecksums,
  buildPackChecksums,
  readLock,
  writeLock,
} from '../../config/core/lock.js';
import { nextStaleTargets } from '../../config/core/lock-stale-targets.js';
import { getCacheDir } from '../../config/remote/remote-fetcher.js';
import { ensureCacheSymlink } from '../../utils/filesystem/fs.js';
import { logger } from '../../utils/output/logger.js';
import { getVersion } from '../version.js';
import type { ResolvedExtend } from '../../config/resolve/resolver.js';
import type { LockFile } from '../../core/types.js';

type LockSources = Pick<LockFile, 'checksums' | 'extends' | 'packs'>;
type LockContent = LockSources & Pick<LockFile, 'outputs' | 'fileOutputs' | 'staleTargets'>;

function sameMap(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function sameStringList(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function sameSources(previous: LockFile, next: LockSources): boolean {
  return (
    sameMap(previous.checksums, next.checksums) &&
    sameMap(previous.extends, next.extends) &&
    sameMap(previous.packs, next.packs)
  );
}

function sameContent(previous: LockFile, next: LockContent): boolean {
  return (
    sameSources(previous, next) &&
    sameMap(previous.outputs, next.outputs) &&
    sameStringList(previous.fileOutputs, next.fileOutputs) &&
    (previous.staleTargets ?? []).join('\n') === (next.staleTargets ?? []).join('\n')
  );
}

/**
 * Write `.agentsmesh/.lock` when its content changed; returns whether it did.
 * `skippedTargets` are enabled targets a `--targets` run did not generate.
 * `fileOutputs` are repo-root paths written by the native `files` feature.
 */
export async function writeLockFile(
  context: { canonicalDir: string; configDir: string },
  resolvedExtends: ResolvedExtend[],
  runOutputs: Record<string, string>,
  filtered: boolean,
  skippedTargets: readonly string[] = [],
  fileOutputs: readonly string[] = [],
): Promise<boolean> {
  const previous = await readLock(context.canonicalDir);
  const sources: LockSources = {
    checksums: await buildChecksums(context.canonicalDir),
    extends: resolvedExtends.length > 0 ? await buildExtendChecksums(resolvedExtends) : {},
    packs: await buildPackChecksums(join(context.canonicalDir, 'packs')),
  };
  const staleTargets = nextStaleTargets(
    previous?.staleTargets,
    skippedTargets,
    previous === null || !sameSources(previous, sources),
  );
  // Full generate replaces the outputs map (dropping disabled targets' entries).
  // Filtered generate merges per-path so untouched targets' entries survive; it
  // never prunes stale entries — an accepted limitation until the next full run.
  const outputs = filtered ? { ...(previous?.outputs ?? {}), ...runOutputs } : runOutputs;
  const nextFileOutputs = [...fileOutputs].map((p) => p.replaceAll('\\', '/')).sort();
  const content: LockContent = {
    ...sources,
    outputs,
    fileOutputs: nextFileOutputs,
    ...(staleTargets ? { staleTargets } : {}),
  };
  // Time, user and version describe the last run that changed the content.
  // Rewriting them on a no-op run dirtied the git tree after every generate.
  const changed = previous === null || !sameContent(previous, content);
  if (changed) {
    await writeLock(context.canonicalDir, {
      generatedAt: new Date().toISOString(),
      generatedBy: process.env['USER'] ?? process.env['USERNAME'] ?? 'unknown',
      libVersion: getVersion(),
      ...content,
    });
  }
  try {
    await ensureCacheSymlink(getCacheDir(), join(context.configDir, '.agentsmeshcache'));
  } catch (err) {
    logger.warn(
      `Could not create .agentsmeshcache symlink: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return changed;
}
