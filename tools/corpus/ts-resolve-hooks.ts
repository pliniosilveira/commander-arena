// Module resolution hooks for running the workspace packages under plain `node file.ts`.
//
// The packages are written for a bundler: relative imports have no extension ("./convert/index")
// and `moduleResolution` is "bundler". Node's type stripping needs the real file name, so this hook
// retries a failed relative import with ".ts" and "/index.ts". It changes nothing else, adds no
// dependency and never touches bare package names. Registered by tools/corpus/register.ts.

import type { ResolveHook } from 'node:module';

const RETRYABLE = new Set(['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT']);
const SUFFIXES = ['.ts', '/index.ts'] as const;

function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const code = errorCode(error);
    if (!isRelative(specifier) || code === undefined || !RETRYABLE.has(code)) throw error;
    for (const suffix of SUFFIXES) {
      try {
        return await nextResolve(`${specifier}${suffix}`, context);
      } catch (retry) {
        const retryCode = errorCode(retry);
        if (retryCode === undefined || !RETRYABLE.has(retryCode)) throw retry;
      }
    }
    throw error;
  }
};
