/**
 * SYNTHETIC reports for the import screen tests. Nothing here is real Scryfall data: the cards are
 * invented and run through the real `importCard`, so their support status is what the parser says.
 */
import {
  type DeckValidation,
  type ImportedCard,
  importCard,
  type StoredCard,
  type StoredFace,
} from '@commander-arena/cards';
import { computeCoverage } from '../src/import/coverage';
import type { ImportedEntry, ImportReport } from '../src/import/types';

export function face(overrides: Partial<StoredFace> = {}): StoredFace {
  return {
    name: 'SYNTHETIC Face',
    manaCost: '',
    typeLine: 'Creature — Test',
    oracleText: '',
    power: null,
    toughness: null,
    loyalty: null,
    defense: null,
    colors: [],
    imageUris: null,
    artist: null,
    ...overrides,
  };
}

export function stored(f: Partial<StoredFace> = {}, card: Partial<StoredCard> = {}): StoredCard {
  const full = face(f);
  return {
    oracleId: `synthetic-oracle-${full.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    scryfallId: 'synthetic-scryfall-0000',
    name: full.name,
    layout: 'normal',
    faces: [full],
    cmc: 0,
    colorIdentity: [],
    keywords: [],
    producedMana: [],
    commanderLegality: 'legal',
    edhrecRank: null,
    gameChanger: null,
    relatedParts: [],
    fetchedAt: 0,
    ...card,
  };
}

export const BEAR: ImportedCard = importCard(
  stored({
    name: 'SYNTHETIC Bear',
    manaCost: '{1}{G}',
    typeLine: 'Creature — Bear',
    power: '2',
    toughness: '2',
    colors: ['G'],
  }),
);

export const PLAINS: ImportedCard = importCard(
  stored({
    name: 'SYNTHETIC Plains',
    typeLine: 'Basic Land — Plains',
    oracleText: '({T}: Add {W}.)',
  }),
);

export const COMMANDER: ImportedCard = importCard(
  stored({
    name: 'SYNTHETIC Leader, the Test',
    manaCost: '{2}{W}',
    typeLine: 'Legendary Creature — Human',
    oracleText: 'Flying',
    power: '3',
    toughness: '3',
    colors: ['W'],
  }),
);

/** Its second line is something the grammar does not know, with a reminder in the first line. */
export const SEER: ImportedCard = importCard(
  stored({
    name: 'SYNTHETIC Seer',
    manaCost: '{1}{U}',
    typeLine: 'Creature — Wizard',
    oracleText:
      'Flying (This creature can only be blocked by creatures with flying.)\nWhen SYNTHETIC Seer enters, venture into the dungeon.',
    power: '1',
    toughness: '1',
    colors: ['U'],
  }),
);

/** Recognised by the grammar, but the engine has no tap cost or activated abilities: notRunnable. */
export const ENGINE_GAP: ImportedCard = importCard(
  stored({
    name: 'SYNTHETIC Engine Gap',
    manaCost: '{1}{U}',
    typeLine: 'Creature — Wizard',
    // Blood is a predefined token (CR 111.10) the engine does not have yet: a real `notRunnable`.
    oracleText: 'When SYNTHETIC Engine Gap enters, create a Blood token.',
    power: '1',
    toughness: '1',
    colors: ['U'],
  }),
);

/** One line the engine cannot run and one the grammar cannot read: both. */
export const BOTH_GAPS: ImportedCard = importCard(
  stored({
    name: 'SYNTHETIC Both Gaps',
    manaCost: '{2}{U}',
    typeLine: 'Creature — Wizard',
    oracleText: 'When SYNTHETIC Both Gaps enters, create a Blood token.\nFrobnicate the glorp.',
    power: '1',
    toughness: '1',
    colors: ['U'],
  }),
);

/** The parser reads "Exile ... Return those cards" as unrecognised today, so the reason is built
 * by hand to cover `unboundReference`: SYNTHETIC diagnostic on a real conversion result. */
export const UNBOUND: ImportedCard = {
  ...SEER,
  stored: stored({
    name: 'SYNTHETIC Unbound',
    typeLine: 'Instant',
    oracleText: 'Exile target creature. Return those cards to the battlefield.',
  }),
  support: {
    ...SEER.support,
    unparsed: [
      {
        face: 0,
        ability: 0,
        text: 'Exile target creature. Return those cards to the battlefield.',
        stoppedAt: 'those cards to the battlefield.',
        closestRule: 'effect.return',
        reason: 'unboundReference',
        reference: 'those cards',
        recognised: ['effect.exile', 'noun.target-permanent'],
      },
    ],
  },
};

/** A schema 1 report (a cached one from before diagnostics v2): no `reason` at all. */
export const LEGACY: ImportedCard = {
  ...SEER,
  support: {
    ...SEER.support,
    unparsed: SEER.support.unparsed.map((u) => ({
      face: u.face,
      ability: u.ability,
      text: u.text,
      stoppedAt: u.stoppedAt,
      closestRule: u.closestRule,
    })),
  },
};

export const entry = (
  card: ImportedCard,
  count = 1,
  section: ImportedEntry['section'] = 'main',
): ImportedEntry => ({ card, count, section });

export const VALID: DeckValidation = { ok: true, issues: [] };

/** A playable report: a commander, a bear, an unsupported seer and thirty-six plains. */
export function playableReport(overrides: Partial<ImportReport> = {}): ImportReport {
  const entries = [
    entry(COMMANDER, 1, 'commander'),
    entry(BEAR, 2),
    entry(SEER),
    entry(PLAINS, 36),
  ];
  return {
    deckName: 'SYNTHETIC Deck',
    parse: {
      sections: { commander: [], main: [], sideboard: [], maybeboard: [], companion: [] },
      hasCommanderMarking: true,
      errors: [],
    },
    entries,
    notFound: [],
    fuzzy: [],
    ignored: [],
    commanderChoices: [],
    commanders: [COMMANDER],
    validation: VALID,
    coverage: computeCoverage(entries),
    playable: true,
    ...overrides,
  };
}

export function emptyReport(overrides: Partial<ImportReport> = {}): ImportReport {
  return playableReport({
    deckName: '',
    entries: [],
    commanders: [],
    validation: null,
    coverage: computeCoverage([]),
    playable: false,
    ...overrides,
  });
}
