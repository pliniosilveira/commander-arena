/** Shared helpers of the import tests: decklists over the SYNTHETIC cards and a ready service. */
import {
  createScryfallClient,
  MemoryCardCache,
  MemorySupportCache,
  type OverrideRegistry,
} from '@commander-arena/cards';
import { createImportService } from '../src/import';
import {
  createFakeScryfall,
  createVirtualClock,
  type FakeScryfallOptions,
} from './import-fake-scryfall';

export interface Harness {
  readonly service: ReturnType<typeof createImportService>;
  readonly supportCache: MemorySupportCache;
  readonly fake: ReturnType<typeof createFakeScryfall>;
  readonly clock: ReturnType<typeof createVirtualClock>;
}

export function harness(
  options: FakeScryfallOptions & { parserVersion?: number; overrides?: OverrideRegistry } = {},
): Harness {
  const clock = createVirtualClock();
  const fake = createFakeScryfall(options);
  const supportCache = new MemorySupportCache();
  const client = createScryfallClient({
    fetch: fake.fetch,
    now: clock.now,
    sleep: clock.sleep,
    cache: new MemoryCardCache({ now: clock.now }),
  });
  const service = createImportService({
    client,
    supportCache,
    ...(options.parserVersion === undefined ? {} : { parserVersion: options.parserVersion }),
    ...(options.overrides === undefined ? {} : { overrides: options.overrides }),
  });
  return { service, supportCache, fake, clock };
}

/**
 * A legal 100-card list: the commander, 39 Forest, 3 taplands, 1 odd land, 40 vanilla, 10 flyers,
 * 5 oddities and the meld card. Supported distinct: everything but the odd land and the five
 * oddities. `Commander` section style.
 */
export function hundredCardText(options: { commanderLine?: string } = {}): string {
  const lines = [
    'Commander',
    options.commanderLine ?? '1 Synthetic Commander',
    '',
    'Deck',
    '39 Forest',
  ];
  for (let i = 1; i <= 3; i += 1) lines.push(`1 Synthetic Tapland ${i}`);
  lines.push('1 Synthetic Odd Land 1');
  for (let i = 1; i <= 40; i += 1) lines.push(`1 Synthetic Vanilla ${i}`);
  for (let i = 1; i <= 10; i += 1) lines.push(`1 Synthetic Flyer ${i}`);
  for (let i = 1; i <= 5; i += 1) lines.push(`1 Synthetic Oddity ${i}`);
  lines.push('1 Synthetic Daybreak // Synthetic Nightfall');
  return lines.join('\n');
}

/**
 * A legal 100-card list of supported cards only (D-056: a deck with an unsupported card is not
 * playable): the commander, 39 Forest, 3 taplands, 47 vanilla and 10 flyers.
 */
export function supportedHundredText(options: { commanderLine?: string } = {}): string {
  const lines = [
    'Commander',
    options.commanderLine ?? '1 Synthetic Commander',
    '',
    'Deck',
    '39 Forest',
  ];
  for (let i = 1; i <= 3; i += 1) lines.push(`1 Synthetic Tapland ${i}`);
  for (let i = 1; i <= 47; i += 1) lines.push(`1 Synthetic Vanilla ${i}`);
  for (let i = 1; i <= 10; i += 1) lines.push(`1 Synthetic Flyer ${i}`);
  return lines.join('\n');
}
