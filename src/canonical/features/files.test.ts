import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  joinGitignoreContent,
  parseFiles,
  templateOutputPath,
} from './files.js';

const TEST_DIR = join(tmpdir(), `agentsmesh-files-${process.pid}`);

describe('templateOutputPath', () => {
  it('maps dot_gitignore to .gitignore', () => {
    expect(templateOutputPath('dot_gitignore')).toBe('.gitignore');
    expect(templateOutputPath('nested/dot_gitignore')).toBe('nested/.gitignore');
  });

  it('skips local gitignore helpers', () => {
    expect(templateOutputPath('.gitignore.prepend')).toBeNull();
    expect(templateOutputPath('.gitignore.append')).toBeNull();
  });

  it('passes through normal paths', () => {
    expect(templateOutputPath('mise.toml')).toBe('mise.toml');
    expect(templateOutputPath('scripts/run.sh')).toBe('scripts/run.sh');
  });
});

describe('joinGitignoreContent', () => {
  it('joins prepend, central, and append with single newlines', () => {
    expect(joinGitignoreContent('a\n', 'b\n', 'c\n')).toBe('a\nb\nc\n');
  });

  it('omits missing helpers without extra blanks', () => {
    expect(joinGitignoreContent(null, 'central\n', null)).toBe('central\n');
    expect(joinGitignoreContent('pre\n', 'central\n', null)).toBe('pre\ncentral\n');
  });
});

describe('parseFiles', () => {
  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(join(TEST_DIR, 'files'), { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('returns [] when the directory is missing', async () => {
    expect(await parseFiles(join(TEST_DIR, 'missing'))).toEqual([]);
  });

  it('parses templates, maps dot_gitignore, skips helpers, preserves mode', async () => {
    writeFileSync(join(TEST_DIR, 'files', 'mise.toml'), '[tools]\n');
    writeFileSync(join(TEST_DIR, 'files', 'dot_gitignore'), 'node_modules/\n');
    writeFileSync(join(TEST_DIR, 'files', '.gitignore.prepend'), '# local\n');
    writeFileSync(join(TEST_DIR, 'files', 'run.sh'), '#!/bin/sh\n');
    chmodSync(join(TEST_DIR, 'files', 'run.sh'), 0o755);

    const files = await parseFiles(join(TEST_DIR, 'files'));
    expect(files.map((f) => f.path)).toEqual(['.gitignore', 'mise.toml', 'run.sh']);
    const sh = files.find((f) => f.path === 'run.sh');
    expect(sh?.mode).toBe(0o755);
    expect(files.find((f) => f.path === '.gitignore')?.content).toBe('node_modules/\n');
  });
});
