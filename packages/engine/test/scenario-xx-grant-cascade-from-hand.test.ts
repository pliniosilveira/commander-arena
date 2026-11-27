// "Enchantment spells you cast from your hand have cascade." (`grantKeywordToSpells` with `castFromHand`): a static ability of a permanent gives cascade to the spells its controller
// casts from the hand that a filter names. Pins: CR 702.85a (Cascade: a triggered ability of the spell as it is cast; the card cast must cost less), CR 601.2i and 603.3b (the trigger
// goes on the stack above the spell), CR 613.1f (layer 6: an ability given to an object), CR 604.2 (a static ability of a permanent), CR 707.10 (a copy is not cast). Cards are
// SYNTHETIC but for the real Grizzly Bears, Mountain, Forest and Island.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type CardDefinition, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const BEARS = 'Grizzly Bears';
const WILD = 'SYNTHETIC Wildsear Maw';
const AURA_A = 'SYNTHETIC Hearth Enchantment'; // {2}{R} enchantment, mana value 3
const AURA_B = 'SYNTHETIC Cheap Enchantment'; // {1}{R} enchantment, mana value 2

const wild: CardDefinition = singleFace({
  name: WILD,
  manaCost: ['3', 'R', 'G'],
  types: ['creature'],
  subtypes: ['Elemental', 'Wolf'],
  colors: ['R', 'G'],
  colorIdentity: ['R', 'G'],
  power: 6,
  toughness: 6,
  oracleText: 'SYNTHETIC: enchantment spells you cast from your hand have cascade.',
  abilities: [
    {
      kind: 'static',
      static: {
        kind: 'grantKeywordToSpells',
        what: { types: ['enchantment'], controller: 'you', castFromHand: true },
        keyword: { kind: 'cascade' },
      },
    },
  ],
});
const enchantment = (name: string, cost: string[]): CardDefinition =>
  singleFace({
    name,
    manaCost: cost,
    types: ['enchantment'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'SYNTHETIC: an enchantment with no abilities.',
    abilities: [],
  });
const auraA = enchantment(AURA_A, ['2', 'R']);
const auraB = enchantment(AURA_B, ['1', 'R']);

const keywordsOf = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  derive(g.state, g.object({ name, zone: 'stack', seat })).abilities.flatMap((a) =>
    a.kind === 'keyword' ? [a.keyword.kind] : [],
  );

/** Seat 0 has the SYNTHETIC enchantment and Bears in hand, the library is cheap enchantment, Bears, Island. */
const build = (withGranter = true) => {
  const b = scenario().define(wild).define(auraA).define(auraB).seat(0);
  return (withGranter ? b.battlefield(WILD) : b)
    .hand(AURA_A, BEARS)
    .battlefield('Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest')
    .library(AURA_B, BEARS, 'Island')
    .seat(1)
    .library('Island', 'Island')
    .at('precombatMain', { active: 0 })
    .build();
};

describe('the card is valid', () => {
  test('the SYNTHETIC granter passes validateCard', () => {
    expect(validateCard(wild)).toEqual([]);
  });
});

describe('Cascade given to the enchantment spells you cast from your hand (CR 702.85a, 613.1f)', () => {
  test('an enchantment spell cast from the hand has cascade: its trigger goes above it', () => {
    const g = build();
    g.act(0).cast(AURA_A, { pay: true });
    expect(keywordsOf(g, AURA_A)).toContain('cascade');
    g.expect.stack([`${AURA_A} (ability)`, AURA_A]);
  });

  test('the trigger resolves before the spell and the cheaper card may be cast free (CR 702.85a)', () => {
    const g = build();
    g.act(0).cast(AURA_A, { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'confirmOptional', purpose: 'cascade' });
    g.act(0).accept();
    // The cascaded enchantment (mana value 2 < 3) is above the spell that cascaded.
    g.expect.stack([AURA_B, AURA_A]);
  });

  test('a cascaded enchantment is cast from exile, not the hand: it has no cascade', () => {
    const g = build();
    g.act(0).cast(AURA_A, { pay: true });
    g.passAll();
    g.act(0).accept();
    expect(keywordsOf(g, AURA_B)).not.toContain('cascade');
    expect(g.state.stack).toHaveLength(2);
  });

  test('a creature spell does not have cascade', () => {
    const g = build();
    g.act(0).cast(BEARS, { pay: true });
    expect(keywordsOf(g, BEARS)).not.toContain('cascade');
    g.expect.stack([BEARS]);
  });

  test('an enchantment spell an opponent casts does not have it (the permanent is not theirs)', () => {
    const g = scenario()
      .define(wild)
      .define(auraA)
      .seat(0)
      .battlefield(WILD)
      .seat(1)
      .hand(AURA_A)
      .battlefield('Mountain', 'Mountain', 'Mountain')
      .library('Island', 'Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(AURA_A, { pay: true });
    expect(keywordsOf(g, AURA_A, 1)).not.toContain('cascade');
    g.expect.stack([AURA_A]);
  });

  test('without the permanent the spell has no cascade (CR 604.2)', () => {
    const g = build(false);
    g.act(0).cast(AURA_A, { pay: true });
    expect(keywordsOf(g, AURA_A)).not.toContain('cascade');
    g.expect.stack([AURA_A]);
  });
});
