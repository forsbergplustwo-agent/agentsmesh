import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateFilesFeature, fileOutputPaths, FILES_TARGET_ID } from './files-feature.js';
import type { CanonicalFiles, GenerateResult } from '../types.js';
import { emptyCanonical } from '../../canonical/load/empty-canonical.js';

const TEST_DIR = join(tmpdir(), `agentsmesh-files-feature-${process.pid}`);

function withFiles(files: CanonicalFiles['files']): CanonicalFiles {
  return { ...emptyCanonical(), files };
}

describe('generateFilesFeature', () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_DIR, '.agentsmesh', 'files'), { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('emits nothing when there are no templates', async () => {
    const results: GenerateResult[] = [];
    await generateFilesFeature(results, withFiles([]), TEST_DIR);
    expect(results).toEqual([]);
  });

  it('copies templates byte-for-byte and joins gitignore helpers', async () => {
    writeFileSync(join(TEST_DIR, '.agentsmesh', 'files', '.gitignore.prepend'), 'local-pre\n');
    writeFileSync(join(TEST_DIR, '.agentsmesh', 'files', '.gitignore.append'), 'local-post\n');
    const results: GenerateResult[] = [];
    await generateFilesFeature(
      results,
      withFiles([
        {
          path: 'mise.toml',
          source: '/x/mise.toml',
          content: '[tools]\nnode = "20"\n',
          mode: 0o644,
        },
        {
          path: '.gitignore',
          source: '/x/dot_gitignore',
          content: 'node_modules/\n',
          mode: 0o644,
        },
      ]),
      TEST_DIR,
    );
    expect(results).toHaveLength(2);
    expect(results[0]?.target).toBe(FILES_TARGET_ID);
    expect(results.find((r) => r.path === 'mise.toml')?.content).toBe('[tools]\nnode = "20"\n');
    expect(results.find((r) => r.path === '.gitignore')?.content).toBe(
      'local-pre\nnode_modules/\nlocal-post\n',
    );
    expect(fileOutputPaths(results)).toEqual(['.gitignore', 'mise.toml']);
  });
});
