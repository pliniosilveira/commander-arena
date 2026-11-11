// Output seam shared by the CLIs, so tests can capture output without a child process.

export interface CliIo {
  out(text: string): void;
  err(text: string): void;
}

/** Writes lines to the process streams. */
export const processIo: CliIo = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
};
