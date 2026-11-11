import { createContext, type ReactNode, useContext } from 'react';
import type { ImportEnvironment } from '../../import/types';

const ImportContext = createContext<ImportEnvironment | null>(null);

/** Provides the import environment (service, stores, request builder) to the import screens. */
export function ImportProvider({
  environment,
  children,
}: {
  environment: ImportEnvironment;
  children: ReactNode;
}) {
  return <ImportContext.Provider value={environment}>{children}</ImportContext.Provider>;
}

export function useImportEnv(): ImportEnvironment {
  const env = useContext(ImportContext);
  if (env === null) throw new Error('ImportProvider is missing');
  return env;
}

/** The import environment when a provider is mounted, else null (the menu works without one). */
export function useOptionalImportEnv(): ImportEnvironment | null {
  return useContext(ImportContext);
}
