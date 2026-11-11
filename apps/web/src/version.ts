/**
 * What the page says about the build it is (D-215): the app (the short git commit and the date of
 * that commit, injected by `vite.config.ts` as constants, so no clock is read), the engine
 * (`ENGINE_VERSION`) and the card parser (`PARSER_VERSION`). Without the injected constants (the
 * unit tests, which do not go through Vite's `define`) the commit reads `dev`.
 */
import { PARSER_VERSION } from '@commander-arena/cards';
import { ENGINE_VERSION } from '@commander-arena/engine';

export interface VersionInfo {
  readonly commit: string;
  /** `YYYY-MM-DD`, or an empty string when the build could not tell. */
  readonly date: string;
  readonly engine: number;
  readonly parser: number;
}

export const APP_COMMIT: string = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev';
export const APP_COMMIT_DATE: string =
  typeof __APP_COMMIT_DATE__ === 'string' ? __APP_COMMIT_DATE__ : '';

export const VERSION_INFO: VersionInfo = {
  commit: APP_COMMIT,
  date: APP_COMMIT_DATE,
  engine: ENGINE_VERSION,
  parser: PARSER_VERSION,
};

/** One line for the footer: `Build a1b2c3d (2026-11-05) · Engine 58 · Card parser 62`. */
export function versionLine(info: VersionInfo): string {
  const build = info.date === '' ? info.commit : `${info.commit} (${info.date})`;
  return `Build ${build} · Engine ${info.engine} · Card parser ${info.parser}`;
}
