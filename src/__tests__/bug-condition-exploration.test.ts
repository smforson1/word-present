/**
 * Bug Condition Exploration Tests — Task 1
 *
 * These tests MUST FAIL on unfixed code.
 * Failure = bug confirmed. DO NOT fix the code to make these pass.
 * They encode the expected (correct/fixed) behavior and will pass after fixes are applied.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 *
 * **Validates: Requirements 1.1**  — Gap 1 QR
 * **Validates: Requirements 1.2**  — Gap 2 Whisper
 * **Validates: Requirements 1.3**  — Gap 3 Packaging
 * **Validates: Requirements 1.4**  — Gap 4 Types
 * **Validates: Requirements 1.5**  — Gap 5 Bookmark Label
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

// ─────────────────────────────────────────────────────────────────────────────
// Gap 3 — Packaging Config
// Deterministic file-system assertions — no mocks needed.
// EXPECT FAIL on unfixed code: electron-builder absent, package script absent,
// electron-builder.json absent.
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap 3 — Packaging Configuration', () => {
  const projectRoot = resolve(__dirname, '../../');
  const pkg = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8'));

  it('electron-builder is present in devDependencies', () => {
    // BUG CONDITION: "electron-builder" NOT IN package.json.devDependencies
    // EXPECTED (fixed): devDependencies has "electron-builder" key
    // COUNTEREXAMPLE: "electron-builder" is absent from devDependencies
    expect(pkg.devDependencies).toHaveProperty('electron-builder');
  });

  it('"package" script is present in scripts', () => {
    // BUG CONDITION: "package" NOT IN package.json.scripts
    // EXPECTED (fixed): scripts["package"] exists
    // COUNTEREXAMPLE: scripts object has no "package" key
    expect(pkg.scripts).toHaveProperty('package');
  });

  it('electron-builder.json config file exists in project root', () => {
    // BUG CONDITION: electron-builder.json DOES NOT EXIST in project root
    // EXPECTED (fixed): file exists and is valid JSON with required fields
    // COUNTEREXAMPLE: file is absent
    const configPath = resolve(projectRoot, 'electron-builder.json');
    expect(existsSync(configPath)).toBe(true);
  });

  it('electron-builder.json has required configuration fields', () => {
    // BUG CONDITION: config file missing or lacks required fields
    // EXPECTED (fixed): valid JSON with appId, productName, directories.output, asar: true, win target
    // COUNTEREXAMPLE: file absent so JSON.parse throws
    const configPath = resolve(projectRoot, 'electron-builder.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config).toHaveProperty('appId');
    expect(config).toHaveProperty('productName');
    expect(config).toHaveProperty('directories');
    expect(config.directories).toHaveProperty('output');
    expect(config).toHaveProperty('asar', true);
    expect(config).toHaveProperty('win');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 4 — TypeScript Type Coverage
// Run tsc --noEmit and inspect the output for relevant type errors.
// EXPECT FAIL on unfixed vite-env.d.ts: queryVerses returns Promise<any[]>,
// addBookmark takes `any`.
// ─────────────────────────────────────────────────────────────────────────────
describe('Gap 4 — window.api TypeScript Type Coverage', () => {
  const projectRoot = resolve(__dirname, '../../');

  it('vite-env.d.ts declares queryVerses return type as Promise<VerseResult[]> (not any[])', () => {
    // BUG CONDITION: queryVerses return type is Promise<any[]>
    // EXPECTED (fixed): return type is Promise<VerseResult[]> — concrete type
    // COUNTEREXAMPLE: the declaration file still uses any[]
    const envDts = readFileSync(
      resolve(projectRoot, 'src/renderer/vite-env.d.ts'),
      'utf-8'
    );
    // The correct declaration should contain VerseResult in the queryVerses return type
    // On unfixed code: `queryVerses: (...) => Promise<any[]>` — this test will fail
    expect(envDts).toMatch(/queryVerses.*Promise<VerseResult\[\]>/);
  });

  it('vite-env.d.ts declares addBookmark parameter as a concrete type (not any)', () => {
    // BUG CONDITION: addBookmark(bookmark: any) — parameter typed as `any`
    // EXPECTED (fixed): addBookmark(bookmark: Omit<BookmarkRecord, 'id'>) — concrete
    // COUNTEREXAMPLE: addBookmark parameter is still `any`
    const envDts = readFileSync(
      resolve(projectRoot, 'src/renderer/vite-env.d.ts'),
      'utf-8'
    );
    // Should NOT match `addBookmark: (bookmark: any)`
    expect(envDts).not.toMatch(/addBookmark\s*:\s*\(bookmark\s*:\s*any\)/);
    // Should match a concrete type
    expect(envDts).toMatch(/addBookmark.*BookmarkRecord/);
  });

  it('tsc --noEmit exits without errors on renderer components', () => {
    // BUG CONDITION: loose `any` types that hide real errors
    // EXPECTED (fixed): tsc --noEmit exits 0
    // NOTE: On unfixed code, tsc already exits 0 because `any` suppresses errors.
    //       The above two tests are the concrete regression guards.
    //       This test simply verifies the compile baseline is clean.
    let output = '';
    let exitCode = 0;
    try {
      output = execSync('npx tsc --noEmit 2>&1', {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 60000,
      });
    } catch (e: any) {
      output = e.stdout || '';
      exitCode = e.status ?? 1;
    }
    const cleanOutput = (output || '').split('\n').filter(line => !line.includes('npm warn') && line.trim()).join('\n');
    expect(exitCode).toBe(0);
    expect(cleanOutput).toBe('');
  });
});
