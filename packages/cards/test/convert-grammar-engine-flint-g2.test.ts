// Flint deck (issue 685), group 2: history counts and spell payment read from the real Oracle text (fixtures/corpus/golden.jsonl) with no override, played through applyAction.
// Mahadi, Emporium Master: "create a Treasure token for each creature that died this turn" (CR 700.4: any player's creatures, tokens too). Smaug, Wicked Worm: "Whenever you cast a spell,
// if mana from a Treasure was spent to cast it, you draw a card and lose 1 life" (CR 601.2h, 603.4, 205.3i; a spell cast with other mana does not trigger it).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const MAHADI = real('Mahadi, Emporium Master');
const SMAUG = real('Smaug, Wicked Worm');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;
const SPELL = parsed('SYNTHETIC Two Drop', 'Creature — Human', '', {
  manaCost: '{2}',
  power: '2',
  toughness: '2',
});
const MAKER = parsed('SYNTHETIC Treasure Maker', 'Sorcery', 'Create two Treasure tokens.', {
  manaCost: '{R}',
});

describe('Mahadi, Emporium Master (CR 700.4)', () => {
  test('is valid', () => {
    expect(validateCard(MAHADI)).toEqual([]);
  });

  const table = () =>
    scenario({ seats: 3 })
      .define(MAHADI)
      .seat(0)
      .library(...FILLER)
      .hand(BOLT, BOLT)
      .pool('RR')
      .battlefield(MAHADI.name)
      .battlefield(BEARS, { label: 'mine' })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, { label: 'theirs' })
      .seat(2)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 });

  const treasures = (g: ScenarioGame) =>
    [0, 1, 2].reduce(
      (n, seat) =>
        n + g.find({ name: 'Treasure', zone: 'battlefield', seat: seat as 0 | 1 | 2 }).length,
      0,
    );

  test('a Treasure for each creature that died this turn, whoever controlled it', () => {
    const g = table().build();
    g.act(0).cast(`${BOLT}[0]`).targets(['mine']).pay();
    g.passAll();
    g.act(0).cast(`${BOLT}[0]`).targets(['theirs']).pay();
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    expect(treasures(g)).toBe(2);
  });

  test('no creature died: no Treasure', () => {
    const g = table().build();
    g.advanceTo('end');
    g.passAll();
    expect(treasures(g)).toBe(0);
  });
});

describe('Smaug, Wicked Worm (CR 601.2h, 603.4)', () => {
  test('is valid and the condition is an intervening "if" about the spell cast', () => {
    expect(validateCard(SMAUG)).toEqual([]);
    expect(SMAUG.faces[0]?.abilities[2]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'castSpell' },
      interveningIf: { kind: 'manaSpentFromSubtype', subtype: 'Treasure' },
    });
  });

  const start = (mountains: number) =>
    scenario()
      .define(SMAUG)
      .define(SPELL)
      .define(MAKER)
      .seat(0)
      .life(20)
      .hand(MAKER.name, SPELL.name, SPELL.name)
      .battlefield(SMAUG.name)
      .battlefield('Mountain', { count: mountains })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a spell paid with a Treasure draws a card and costs 1 life', () => {
    const g = start(1);
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    const hand = (g.state.seats[0]?.hand ?? []).length;
    g.act(0).cast(`${SPELL.name}[0]`, { pay: true });
    g.passAll();
    g.expect.life(0, 19);
    expect((g.state.seats[0]?.hand ?? []).length).toBe(hand);
  });

  test('a spell paid with lands only does not trigger it', () => {
    const g = start(2);
    g.act(0).cast(`${SPELL.name}[0]`, { pay: true });
    g.passAll();
    g.expect.life(0, 20);
  });
});
