/**
 * SYNTHETIC CARDS FOR GROUP 9 OF THE HASHATON DECK (issue 31, D-390 to D-395 provisional). NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of the primitives Rona, Herald of Invasion // Rona, Tolarian Obliterator needs: an ordinary activated ability whose cost has a Phyrexian
 * mana symbol (CR 107.4f), and the transform on it; the exile of a random card from a hand (`exileRandomFromHand`), alone and after "Whenever a source deals damage to this
 * creature" (the player is the controller of the source, `triggerPlayer`), and the two offers that follow it, to put a land card onto the battlefield and to cast a spell
 * for free. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is the definition of a real card.
 */
import type { Ability, Effect, TargetSpec } from '../../ast/types';
import type { CardDefinition, CardFace } from '../definition';
import { singleFace } from './helpers';

const THIS = { kind: 'this' } as const;
const TRIGGER_PLAYER = { kind: 'triggerPlayer' } as const;

/** "{B/P}: Draw a card." (a Phyrexian symbol alone: CR 107.4f, paid with {B} or 2 life). */
const scribe = (): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Phyrexian Scribe',
    manaCost: ['1', 'U'],
    types: ['creature'],
    subtypes: ['Human', 'Wizard'],
    colors: ['U'],
    colorIdentity: ['U', 'B'],
    power: 1,
    toughness: 3,
    oracleText: '{B/P}: Draw a card.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'mana', symbols: ['B/P'] }],
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ],
  });

/** The front face of the transforming card: "{5}{B/P}: Transform this creature. Activate only as a sorcery." */
const frontFace: CardFace = {
  name: 'Phyrexian Seer',
  manaCost: ['1', 'U'],
  supertypes: [],
  types: ['creature'],
  subtypes: ['Human', 'Wizard'],
  colors: ['U'],
  power: 1,
  toughness: 3,
  loyalty: null,
  defense: null,
  oracleText: '{5}{B/P}: Transform this creature. Activate only as a sorcery.',
  abilities: [
    {
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['5', 'B/P'] }],
      timing: 'sorcery',
      effect: { kind: 'transform', objects: THIS },
    },
  ],
  spell: null,
};

const backFace: CardFace = {
  name: 'Phyrexian Colossus',
  manaCost: null,
  supertypes: [],
  types: ['creature'],
  subtypes: ['Phyrexian', 'Wizard'],
  colors: ['U', 'B'],
  power: 5,
  toughness: 5,
  loyalty: null,
  defense: null,
  oracleText: 'Trample',
  abilities: [{ kind: 'keyword', keyword: { kind: 'trample' } }],
  spell: null,
};

const PLAYER_TARGET: TargetSpec = { id: 't1', what: { kind: 'player', filter: 'any' } };

/** "{T}: Target player exiles a card from their hand at random." */
const pointer = (): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Chaos Pointer',
    manaCost: ['1', 'B'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText: '{T}: Target player exiles a card from their hand at random.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [PLAYER_TARGET],
        effect: { kind: 'exileRandomFromHand', player: { kind: 'target', id: 't1' } },
      },
    ],
  });

/** "If it's a land card, you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost." */
const LAND_OR_CAST: Effect = {
  kind: 'conditional',
  condition: { kind: 'objectMatches', of: { kind: 'moved' }, filter: { types: ['land'] } },
  effect: {
    kind: 'may',
    effect: {
      kind: 'moveToZone',
      objects: { kind: 'moved' },
      to: 'battlefield',
      controller: 'you',
    },
  },
  else: { kind: 'castFree', objects: { kind: 'moved' } },
};

const EXILE_AT_RANDOM: Effect = { kind: 'exileRandomFromHand', player: TRIGGER_PLAYER };

/**
 * "{T}: You exile a card from your hand at random, then target player exiles a card from their hand at random. You may cast it without paying its mana cost.": two exiles in a row,
 * so that "it" is the card of the second, and nothing when the second hand is empty (the first card is not "it" any more).
 */
const twice = (): CardDefinition =>
  singleFace({
    name: 'SYNTHETIC Chaos Twice',
    manaCost: ['2', 'B'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['B'],
    colorIdentity: ['B'],
    power: 1,
    toughness: 1,
    oracleText:
      '{T}: You exile a card from your hand at random, then target player exiles a card from their hand at random. You may cast it without paying its mana cost.',
    abilities: [
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [PLAYER_TARGET],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'exileRandomFromHand', player: { kind: 'you' } },
            { kind: 'exileRandomFromHand', player: { kind: 'target', id: 't1' } },
            { kind: 'castFree', objects: { kind: 'moved' } },
          ],
        },
      },
    ],
  });

/** A 5/5 with a trigger of "a source deals damage to this creature" whose effect is `effect`. */
const obliterator = (name: string, text: string, effect: Effect): CardDefinition =>
  singleFace({
    name,
    manaCost: ['3', 'U', 'B'],
    types: ['creature'],
    subtypes: ['Phyrexian', 'Wizard'],
    colors: ['U', 'B'],
    colorIdentity: ['U', 'B'],
    power: 5,
    toughness: 5,
    oracleText: text,
    abilities: [
      { kind: 'keyword', keyword: { kind: 'trample' } },
      { kind: 'triggered', trigger: { kind: 'dealtDamage', what: THIS }, effect },
    ] satisfies readonly Ability[],
  });

const EXILE_TEXT =
  "Whenever a source deals damage to this creature, that source's controller exiles a card from their hand at random.";

export const SYNTHETIC_HASHATON_G9_LIST: readonly CardDefinition[] = [
  scribe(),
  {
    oracleId: null,
    name: 'SYNTHETIC Phyrexian Seer // Phyrexian Colossus',
    layout: 'transform',
    faces: [frontFace, backFace],
    colorIdentity: ['U', 'B'],
    support: 'supported',
  },
  pointer(),
  twice(),
  // The exile alone: the damager's controller exiles a card from their hand at random.
  obliterator('SYNTHETIC Chaos Obelisk', EXILE_TEXT, EXILE_AT_RANDOM),
  // The whole body of the real card: the exile, then the land or the free cast.
  obliterator(
    'SYNTHETIC Chaos Obliterator',
    `${EXILE_TEXT} If it's a land card, you may put it onto the battlefield under your control. Otherwise, you may cast it without paying its mana cost.`,
    { kind: 'sequence', effects: [EXILE_AT_RANDOM, LAND_OR_CAST] },
  ),
];
