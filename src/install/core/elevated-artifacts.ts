/**
 * Consent gate for "elevated" install artifacts: `hooks`, `permissions`,
 * `mcp`, and (for extends) `files`. hooks/permissions/mcp control the user's
 * tool settings at generate time (e.g. Claude Code `settings.json` hooks →
 * shell commands, MCP server launch specs → spawned child processes). `files`
 * writes arbitrary paths into the repo root. A third-party source that ships
 * any of them effectively gets local code execution / filesystem writes.
 *
 * For non-local sources the default is **strip**. The user has to opt in
 * per-artifact (`--accept-hooks`, `--accept-permissions`, `--accept-mcp`, or
 * `accept: [files]` on extends) or to the install trio (`--accept-elevated`).
 * Local sources are trusted as-is because the user already controls those bytes.
 */

import type { CanonicalFiles } from '../../core/types.js';
import type { InstallSourceKind } from '../source/install-source-types.js';

export type ElevatedArtifact = 'hooks' | 'permissions' | 'mcp' | 'files';

export interface ElevatedArtifactGateOptions {
  readonly sourceKind: InstallSourceKind;
  readonly acceptHooks: boolean;
  readonly acceptPermissions: boolean;
  readonly acceptMcp: boolean;
  readonly acceptFiles?: boolean;
}

export interface ElevatedArtifactGateResult {
  readonly canonical: CanonicalFiles;
  /** Names of elevated artifacts that were nulled out by the gate. */
  readonly stripped: ElevatedArtifact[];
}

export function stripUntrustedElevatedArtifacts(
  canonical: CanonicalFiles,
  options: ElevatedArtifactGateOptions,
): ElevatedArtifactGateResult {
  if (options.sourceKind === 'local') {
    return { canonical, stripped: [] };
  }

  const stripped: ElevatedArtifact[] = [];
  let hooks = canonical.hooks;
  let permissions = canonical.permissions;
  let mcp = canonical.mcp;
  let files = canonical.files ?? [];

  if (hooks !== null && !options.acceptHooks) {
    hooks = null;
    stripped.push('hooks');
  }
  if (permissions !== null && !options.acceptPermissions) {
    permissions = null;
    stripped.push('permissions');
  }
  if (mcp !== null && !options.acceptMcp) {
    mcp = null;
    stripped.push('mcp');
  }
  if (files.length > 0 && options.acceptFiles !== true) {
    files = [];
    stripped.push('files');
  }

  if (stripped.length === 0) {
    return { canonical, stripped: [] };
  }

  return {
    canonical: { ...canonical, hooks, permissions, mcp, files },
    stripped,
  };
}
