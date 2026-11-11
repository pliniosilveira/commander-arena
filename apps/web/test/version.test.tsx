import { PARSER_VERSION } from '@commander-arena/cards';
import { ENGINE_VERSION } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { readBuildInfo } from '../build-info';
import { Footer } from '../src/App';
import { VERSION_INFO, versionLine } from '../src/version';

describe('the versions of the build (issue 104, D-215)', () => {
  test('the line names the commit, its date, the engine and the card parser', () => {
    expect(versionLine({ commit: 'a1b2c3d', date: '2026-11-05', engine: 58, parser: 62 })).toBe(
      'Build a1b2c3d (2026-11-05) · Engine 58 · Card parser 62',
    );
  });

  test('a build that cannot tell the date leaves it out', () => {
    expect(versionLine({ commit: 'dev', date: '', engine: 1, parser: 2 })).toBe(
      'Build dev · Engine 1 · Card parser 2',
    );
  });

  test("the engine and parser numbers are the packages' own constants", () => {
    expect(VERSION_INFO.engine).toBe(ENGINE_VERSION);
    expect(VERSION_INFO.parser).toBe(PARSER_VERSION);
  });

  test('the commit is a short hash, or dev where there is no checkout', () => {
    expect(VERSION_INFO.commit).toMatch(/^([0-9a-f]{7}|dev)$/);
  });

  test('the footer shows the versions only when asked (the start screen)', () => {
    expect(renderToStaticMarkup(<Footer showVersion />)).toContain('data-testid="app-version"');
    expect(renderToStaticMarkup(<Footer />)).not.toContain('app-version');
  });

  test('the build info reads git first', () => {
    const run = (args: readonly string[]) => (args[0] === 'log' ? '2026-11-05' : 'ABCDEF1');
    expect(readBuildInfo({ GITHUB_SHA: '1234567890abcdef' }, run)).toEqual({
      commit: 'abcdef1',
      date: '2026-11-05',
    });
  });

  test('without a .git checkout the CI commit is used, and dev when there is none', () => {
    const noGit = () => null;
    expect(readBuildInfo({ WORKERS_CI_COMMIT_SHA: '0123456789abcdef0123' }, noGit)).toEqual({
      commit: '0123456',
      date: '',
    });
    expect(readBuildInfo({ CF_PAGES_COMMIT_SHA: 'not a hash' }, noGit)).toEqual({
      commit: 'dev',
      date: '',
    });
    expect(readBuildInfo({}, noGit)).toEqual({ commit: 'dev', date: '' });
  });
});
