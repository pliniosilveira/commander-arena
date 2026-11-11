// SYNTHETIC Scryfall-shaped card objects for the corpus tests. Nothing here is real card data:
// every name starts with "SYNTHETIC", the ids are invented, and the ability texts use made-up
// words ("glorp", "frobnicate", "wibble", "quux") so that no grammar rule can ever read them,
// however far the parser grows.
//
// Unsupported shapes, with the cards that carry them (see synthetic.test.ts for the numbers):
//   A  "Whenever SYNTHETIC glorp N, frobnicate target gizmo."   (N differs between cards)
//   B  "SYNTHETIC wibble: zork each plinth."
//   C  "At the beginning of your upkeep, quux a snark."

export interface SyntheticCard {
  readonly id: string;
  readonly oracle_id: string;
  readonly name: string;
  readonly layout: string;
  readonly cmc: number;
  readonly type_line: string;
  readonly mana_cost?: string;
  readonly oracle_text?: string;
  readonly power?: string;
  readonly toughness?: string;
  readonly colors?: string[];
  readonly color_identity?: string[];
  readonly keywords?: string[];
  readonly legalities: { readonly commander: string };
  readonly edhrec_rank?: number;
  readonly card_faces?: readonly Record<string, unknown>[];
}

export const SHAPE_A = (n: number) => `Whenever SYNTHETIC glorp ${n}, frobnicate target gizmo.`;
export const SHAPE_B = 'SYNTHETIC wibble: zork each plinth.';
export const SHAPE_C = 'At the beginning of your upkeep, quux a snark.';

let counter = 0;

export function card(
  name: string,
  fields: Partial<SyntheticCard> & { rank?: number | undefined } = {},
): SyntheticCard {
  counter += 1;
  const { rank, ...rest } = fields;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    oracle_id: `11111111-1111-4111-8111-${String(counter).padStart(12, '0')}`,
    name: `SYNTHETIC ${name}`,
    layout: 'normal',
    cmc: 2,
    type_line: 'Creature — Synth',
    mana_cost: '{1}{G}',
    oracle_text: '',
    power: '2',
    toughness: '2',
    colors: ['G'],
    color_identity: ['G'],
    keywords: [],
    legalities: { commander: 'legal' },
    ...(rank === undefined ? {} : { edhrec_rank: rank }),
    ...rest,
  };
}

/** The fixed SYNTHETIC corpus: a few dozen cards. */
export function syntheticCards(): SyntheticCard[] {
  counter = 0;
  const cards: SyntheticCard[] = [];
  // Supported, Commander-legal: five vanilla, three with Flying, one mana artifact, one unranked.
  for (let i = 1; i <= 5; i++) cards.push(card(`Vanilla ${i}`, { rank: i * 100 }));
  for (let i = 1; i <= 3; i++) {
    cards.push(card(`Flier ${i}`, { rank: 1000 + i, oracle_text: 'Flying', keywords: ['Flying'] }));
  }
  cards.push(
    card('Mana Rock', {
      rank: 9,
      type_line: 'Artifact',
      mana_cost: '{2}',
      oracle_text: '{T}: Add {G}.',
      power: undefined as never,
      toughness: undefined as never,
    }),
  );
  cards.push(card('Vanilla Unranked'));
  // Shape A: four cards that differ only in the number, one without a rank.
  cards.push(card('Glorper 1', { rank: 10, oracle_text: SHAPE_A(1) }));
  cards.push(card('Glorper 2', { rank: 20, oracle_text: SHAPE_A(2) }));
  cards.push(card('Glorper 3', { rank: 40, oracle_text: SHAPE_A(3) }));
  cards.push(card('Glorper Unranked', { oracle_text: SHAPE_A(4) }));
  // Shape A on a card that has another reason too (a * power): blocks A but is not a sole blocker.
  cards.push(
    card('Star Glorper', { rank: 2, power: '*', toughness: '*', oracle_text: SHAPE_A(5) }),
  );
  // Shape B: two sole blockers, one more with an unsupported layout.
  cards.push(card('Wibbler 1', { rank: 5, oracle_text: SHAPE_B }));
  cards.push(card('Wibbler 2', { rank: 600, oracle_text: SHAPE_B }));
  cards.push(card('Flipped Wibbler', { rank: 90, layout: 'flip', oracle_text: SHAPE_B }));
  // Shapes A and B on one card: blocked by two shapes, so a sole blocker of neither.
  cards.push(card('Double Shape', { rank: 7, oracle_text: `${SHAPE_A(6)}\n${SHAPE_B}` }));
  // Shape C: one card, and one with Flying besides (Flying parses, C does not).
  cards.push(card('Quuxer 1', { rank: 1500, oracle_text: SHAPE_C }));
  cards.push(
    card('Quuxer 2', {
      rank: 800,
      oracle_text: `Flying\n${SHAPE_C}`,
      keywords: ['Flying'],
    }),
  );
  // A double-faced card: both faces carry shape C, so it is unsupported whatever the layout does.
  cards.push(
    card('Two Faced', {
      rank: 300,
      layout: 'transform',
      type_line: undefined as never,
      card_faces: [
        {
          name: 'SYNTHETIC Two Faced Front',
          mana_cost: '{1}{G}',
          type_line: 'Creature — Synth',
          oracle_text: SHAPE_C,
          power: '1',
          toughness: '1',
          colors: ['G'],
        },
        {
          name: 'SYNTHETIC Two Faced Back',
          mana_cost: '',
          type_line: 'Creature — Synth',
          oracle_text: SHAPE_C,
          power: '3',
          toughness: '3',
          colors: ['G'],
        },
      ],
    }),
  );
  // Not Commander-legal (kept only with --all), and one restricted card (kept).
  cards.push(card('Illegal Vanilla', { rank: 4, legalities: { commander: 'not_legal' } }));
  cards.push(card('Banned Vanilla', { rank: 3, legalities: { commander: 'banned' } }));
  cards.push(card('Restricted Vanilla', { rank: 200, legalities: { commander: 'restricted' } }));
  cards.push(
    card('Token Bear', {
      layout: 'token',
      legalities: { commander: 'not_legal' },
      oracle_text: SHAPE_B,
    }),
  );
  return cards;
}

/** `n` ranked vanilla cards with ranks 1..n, the first `supported` of them supported. */
export function rankedFiller(n: number, supported: number, firstRank = 2000): SyntheticCard[] {
  const out: SyntheticCard[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      card(`Filler ${String(i).padStart(4, '0')}`, {
        rank: firstRank + i,
        oracle_text: i < supported ? '' : SHAPE_B,
      }),
    );
  }
  return out;
}
