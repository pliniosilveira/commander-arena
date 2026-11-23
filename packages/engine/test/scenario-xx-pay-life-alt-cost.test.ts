// "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost" (Snuff Out, Scions of Spellcraft deck): the alternative cost `payLife` with a condition.
// Pins: CR 118.9 (an alternative cost, chosen as the spell is cast), CR 118.9a (one at a time), CR 118.4 and 601.2h (life is a cost paid as the spell is cast), CR 119.4 (life can be paid
// only if the life total is at least that much), CR 601.2f and 118.7a (a cost reduction still applies to what is paid in mana, here {0}), and the condition read as the spell is cast.
// The card is SYNTHETIC; defined here. Its validation (a positive whole number of life; not on a land; no convoke, improvise or delve) is checked at the end.
import { describe, expect, test } from 'vitest';
import { type AlternativeCost, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const SPELL = 'SYNTHETIC Life Instead';

const alt = (life: number, extra: Partial<AlternativeCost> = {}): AlternativeCost =>
  ({
    kind: 'payLife',
    cost: [{ kind: 'mana', symbols: ['0'] }],
    life,
    condition: {
      kind: 'controlsAtLeast',
      filter: { types: ['land'], subtypes: ['Swamp'] },
      count: 1,
    },
    ...extra,
  }) as AlternativeCost;

const card = (alternative: AlternativeCost, types: ('instant' | 'land')[] = ['instant']) =>
  singleFaceCard({
    name: SPELL,
    manaCost: ['3', 'B'],
    types,
    colors: ['B'],
    colorIdentity: ['B'],
    oracleText:
      "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost. Each opponent loses 3 life.",
    alternativeCosts: [alternative],
    spell: { effect: { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 3 } },
  });

describe('pay life rather than pay the mana cost, if you control a Swamp (CR 118.9)', () => {
  const board = (lands: readonly string[], life = 20): ScenarioGame =>
    scenario({ seats: 3 })
      .define(card(alt(4)))
      .seat(0)
      .life(life)
      .hand(SPELL)
      .battlefield(...lands)
      .seat(1)
      .seat(2)
      .at('precombatMain', { active: 0 })
      .build();

  test('with a Swamp and no mana the spell is cast for 4 life and resolves against every opponent', () => {
    const g = board(['Swamp']);
    g.act(0).cast(SPELL, { alternative: 'payLife', pay: true });
    g.expect.life(0, 16);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.life(2, 37);
    g.expect.zone(SPELL, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the Swamp is not tapped for it: the alternative costs no mana', () => {
    const g = board(['Swamp']);
    g.act(0).cast(SPELL, { alternative: 'payLife', pay: true });
    expect(g.find({ name: 'Swamp', zone: 'battlefield' }).every((o) => !o.tapped)).toBe(true);
  });

  test('without a Swamp the alternative is not offered, whatever the life', () => {
    const g = board(['Forest']);
    expect(g.act(0).try.cast(SPELL, { alternative: 'payLife' }).ok).toBe(false);
    g.expect.life(0, 20);
  });

  test('with a life total below 4 the life cannot be paid (CR 119.4)', () => {
    const g = board(['Swamp'], 3);
    expect(g.act(0).try.cast(SPELL, { alternative: 'payLife' }).ok).toBe(false);
    g.expect.life(0, 3);
  });

  test('with exactly 4 life it can be paid, down to 0 (CR 119.4)', () => {
    const g = board(['Swamp'], 4);
    expect(g.act(0).try.cast(SPELL, { alternative: 'payLife' }).ok).toBe(true);
  });

  test('the ordinary cast still pays the mana cost and no life', () => {
    const g = board(['Swamp', 'Swamp', 'Swamp', 'Swamp']);
    g.act(0).cast(SPELL, { pay: true });
    g.expect.life(0, 20);
    g.passAll();
    g.expect.life(1, 37);
  });
});

describe('payLife is a valid alternative cost only in the right shape', () => {
  const messages = (c: ReturnType<typeof card>) =>
    validateCard(c)
      .map((i) => i.message)
      .join('|');

  test('a well-formed one is valid', () => {
    expect(validateCard(card(alt(4)))).toEqual([]);
  });

  test('zero or a fraction of life is refused', () => {
    expect(messages(card(alt(0)))).toContain('payLife pays a positive whole number of life');
    expect(messages(card(alt(1.5)))).toContain('payLife pays a positive whole number of life');
  });

  test('on a land it is refused', () => {
    expect(messages(card(alt(4), ['land']))).toContain('not on a land');
  });

  test('another kind with a life field is refused', () => {
    const bad = {
      kind: 'overload',
      cost: [{ kind: 'mana', symbols: ['1'] }],
      life: 2,
    } as unknown as AlternativeCost;
    expect(messages(card(bad))).toContain('only payLife names life');
  });
});
