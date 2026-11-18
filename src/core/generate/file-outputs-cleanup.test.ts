import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cleanupStaleFileOutputs, findStaleFileOutputs } from './file-outputs-cleanup.js';

const TEST_DIR = join(tmpdir(), `agentsmesh-file-outputs-${process.pid}`);

describe('file-outputs-cleanup', () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('finds previous paths missing from expected', async () => {
    writeFileSync(join(TEST_DIR, 'old.toml'), 'x\n');
    writeFileSync(join(TEST_DIR, 'keep.toml'), 'y\n');
    const stale = await findStaleFileOutputs({
      projectRoot: TEST_DIR,
      previous: ['old.toml', 'keep.toml', 'already-gone.toml'],
      expected: ['keep.toml'],
    });
    expect(stale).toEqual(['old.toml']);
  });

  it('deletes stale outputs', async () => {
    writeFileSync(join(TEST_DIR, 'stale.sh'), '#!/bin/sh\n');
    writeFileSync(join(TEST_DIR, 'keep.sh'), '#!/bin/sh\n');
    await cleanupStaleFileOutputs({
      projectRoot: TEST_DIR,
      previous: ['stale.sh', 'keep.sh'],
      expected: ['keep.sh'],
    });
    expect(existsSync(join(TEST_DIR, 'stale.sh'))).toBe(false);
    expect(existsSync(join(TEST_DIR, 'keep.sh'))).toBe(true);
  });
});
