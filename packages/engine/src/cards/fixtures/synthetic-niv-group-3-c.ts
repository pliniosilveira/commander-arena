/**
 * SYNTHETIC CARDS FOR "YOU MAY CAST TARGET INSTANT OR SORCERY CARD FROM A GRAVEYARD". NOT REAL MAGIC CARDS.
 *
 * Invented for the tests of D-990 to D-994 (group 3-c of the Niv-Mizzet deck): the effect `castCard` that lets the controller of a resolving ability cast a
 * target card of any graveyard paying its mana cost (CR 608.2g, 601.2), and its two riders on that one spell: "mana of any type can be spent to cast that spell"
 * (CR 609.4b) and "If that spell would be put into a graveyard, exile it instead" (CR 614.1a). One creature for each combination of the riders, so each
 * can be pinned alone. Names start with "SYNTHETIC "; oracleId is null. The text describes what the AST does; it is not Oracle text, and none of these is
 * the definition of a real card. The spells cast are real fixtures (Lightning Bolt, Divination, Counterspell, Murder) or the synthetic ones below.
 */
import type { Ability, TargetSpec } from '../../ast/types';
import type { CardDefinition } from '../definition';
import { singleFace } from './helpers';

/** "target instant or sorcery card from a graveyard". */
const INSTANT_OR_SORCERY_CARD: TargetSpec = {
  id: 't1',
  what: {
    kind: 'object',
    filter: { zone: 'graveyard', anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }] },
  },
};

const caster = (
  name: string,
  words: string,
  riders: { readonly anyManaType?: true; readonly exileInstead?: true },
): CardDefinition => {
  const ability: Ability = {
    kind: 'triggered',
    trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
    targets: [INSTANT_OR_SORCERY_CARD],
    effect: {
      kind: 'castCard',
      object: { kind: 'target', id: 't1' },
      ...riders,
    },
  };
  return singleFace({
    name,
    manaCost: ['2', 'U'],
    types: ['creature'],
    subtypes: ['Wizard'],
    colors: ['U'],
    colorIdentity: ['U'],
    power: 2,
    toughness: 2,
    oracleText: words,
    abilities: [ability],
  });
};

export const SYNTHETIC_NIV_GROUP_3_C_LIST: readonly CardDefinition[] = [
  // "When this enters, you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be
  // put into a graveyard, exile it instead."
  caster(
    'SYNTHETIC Graveyard Caster',
    'When this creature enters, you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put into a graveyard, exile it instead.',
    { anyManaType: true, exileInstead: true },
  ),
  // "When this enters, you may cast target instant or sorcery card from a graveyard." (the plain cast: the spell goes to the graveyard as any spell, mana of its colors)
  caster(
    'SYNTHETIC Plain Graveyard Caster',
    'When this creature enters, you may cast target instant or sorcery card from a graveyard.',
    {},
  ),
  // "..., and mana of any type can be spent to cast that spell." (no exile)
  caster(
    'SYNTHETIC Any Mana Caster',
    'When this creature enters, you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell.',
    { anyManaType: true },
  ),
  // "..., If that spell would be put into a graveyard, exile it instead." (the mana of its colors)
  caster(
    'SYNTHETIC Exile Instead Caster',
    'When this creature enters, you may cast target instant or sorcery card from a graveyard. If that spell would be put into a graveyard, exile it instead.',
    { exileInstead: true },
  ),
  // A sorcery with a snow symbol in its cost, for "mana of any type" that is still not snow mana: {S}{S}, draw a card.
  singleFace({
    name: 'SYNTHETIC Snowy Study',
    manaCost: ['S', 'S'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Draw a card.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  // A sorcery that needs colorless mana: {1}{C}, draw a card.
  singleFace({
    name: 'SYNTHETIC Colorless Study',
    manaCost: ['1', 'C'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: 'Draw a card.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  // A sorcery with a hybrid symbol and a Phyrexian one: {W/U}{B/P}, draw a card.
  singleFace({
    name: 'SYNTHETIC Mixed Study',
    manaCost: ['W/U', 'B/P'],
    types: ['sorcery'],
    colors: ['W', 'U', 'B'],
    colorIdentity: ['W', 'U', 'B'],
    oracleText: 'Draw a card.',
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  // A sorcery that needs its caster to pay an additional cost they do not have: a creature to sacrifice. "Sacrifice a creature as an additional cost: draw a card."
  singleFace({
    name: 'SYNTHETIC Bloody Study',
    manaCost: ['U'],
    types: ['sorcery'],
    colors: ['U'],
    colorIdentity: ['U'],
    oracleText: 'As an additional cost to cast this spell, sacrifice a creature. Draw a card.',
    additionalCosts: [{ kind: 'sacrifice', what: { types: ['creature'] } }],
    spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
  }),
  // A permanent that is not an instant or a sorcery: not a legal target of the casters above.
  singleFace({
    name: 'SYNTHETIC Quiet Bear',
    manaCost: ['1', 'G'],
    types: ['creature'],
    subtypes: ['Bear'],
    colors: ['G'],
    colorIdentity: ['G'],
    power: 2,
    toughness: 2,
    oracleText: '',
  }),
];
