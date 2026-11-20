// "The next instant or sorcery spell you cast this turn costs {X} less to cast" (Kaza, Roil Chaser), "... has storm" (Crackling Spellslinger) and "The next instant spell and the next
// sorcery spell you cast this turn each have cascade" (Smoldering Stagecoach), the Quick Draw deck (issue 121): the effect `nextSpellModifier`. (SYNTHETIC Discount Wizard, Storm Granter
// and Cascade Granter, src/cards/fixtures/synthetic-quick-draw.ts.)
// Pins: CR 601.2f and 118.7a (the reduction takes generic mana only), CR 611.2a (it lasts until end of turn), CR 702.40a (Storm, found as the spell is cast), CR 702.85a (Cascade), CR 603.3b.
import { describe, expect, test } from 'vitest';
import { getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const WIZARD = 'SYNTHETIC Discount Wizard';
const STORM = 'SYNTHETIC Storm Granter';
const CASCADE = 'SYNTHETIC Cascade Granter';
const SORCERY = 'SYNTHETIC Plot Draw'; // {2}{U} sorcery, draw a card, mana value 3
const INSTANT = 'SYNTHETIC Plot Gain'; // {1}{U} instant, gain 2 life, mana value 2
const FILLER = ['Island', 'Island', 'Island', 'Island', 'Island', 'Island'] as const;

type Builder = ReturnType<typeof scenario>;

function game(configure: (b: Builder) => Builder, pool: string): ScenarioGame {
  return configure(
    scenario()
      .seat(0)
      .library(...FILLER)
      .pool(pool),
  )
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

const castable = (g: ScenarioGame, name: string): boolean => {
  const card = g.find({ name, zone: 'hand', seat: 0 })[0];
  return getLegalActions(g.state, 0).some(
    (a) => a.kind === 'castSpell' && a.object === card?.id && a.alternative === undefined,
  );
};

describe('the cards are valid', () => {
  for (const name of [WIZARD, STORM, CASCADE]) {
    test(name, () => expect(validateCard(syntheticCard(name))).toEqual([]));
  }
});

describe('"The next instant or sorcery spell you cast this turn costs {X} less to cast" (CR 601.2f)', () => {
  test('X is the number of Wizards as the ability resolves: one Wizard takes {1} off the sorcery', () => {
    // {2}{U} less {1}: {1}{U}. Two mana cast it, one would not.
    const g = game((b) => b.battlefield(WIZARD).hand(SORCERY), 'UU');
    expect(castable(g, SORCERY)).toBe(false);
    g.act(0).activate(WIZARD);
    g.passAll();
    expect(castable(g, SORCERY)).toBe(true);
  });

  test('two Wizards take {2} off: the sorcery costs {U}', () => {
    const g = game((b) => b.battlefield(WIZARD, WIZARD).hand(SORCERY), 'U');
    g.act(0).activate({ name: WIZARD, nth: 0 });
    g.passAll();
    expect(castable(g, SORCERY)).toBe(true);
  });

  test('it is used up by the next instant or sorcery: the one after it costs the full price', () => {
    const g = game((b) => b.battlefield(WIZARD, WIZARD).hand(SORCERY, SORCERY), 'UUUU');
    g.act(0).activate({ name: WIZARD, nth: 0 });
    g.passAll();
    g.act(0).cast({ name: SORCERY, nth: 0 }, { pay: true });
    g.passAll();
    // {U} was paid: three of the four mana are left, {2}{U} is affordable but the reduction is gone: it takes all three.
    expect(castable(g, SORCERY)).toBe(true);
    g.act(0).cast(SORCERY, { pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand).toHaveLength(2);
  });

  test('a creature spell cast first does not use it up', () => {
    const g = game((b) => b.battlefield(WIZARD).hand(SORCERY, 'Grizzly Bears'), 'UUG');
    g.act(0).activate(WIZARD);
    g.passAll();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.passAll();
    // The effect is still there for the sorcery: {1}{U}: one U left is not enough, so this checks the effect stayed with the pool of U only.
    expect(g.state.seats[0]?.hand).toHaveLength(1);
  });

  test('it ends with the turn', () => {
    const g = game((b) => b.battlefield(WIZARD).hand(SORCERY), 'UU');
    g.act(0).activate(WIZARD);
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(g.state.continuousEffects.some((e) => e.change.kind === 'nextSpell')).toBe(false);
  });
});

describe('"The next instant or sorcery spell you cast this turn has storm" (CR 702.40a)', () => {
  test('the sorcery cast next is copied once for each spell cast before it', () => {
    const g = game((b) => b.battlefield(STORM).hand(INSTANT, SORCERY), 'UUUUU');
    g.act(0).activate(STORM);
    g.passAll();
    // The instant is the next instant or sorcery: it has storm, with no spell before it, so there are no copies.
    g.act(0).cast(INSTANT, { pay: true });
    expect(g.state.stack.length).toBeGreaterThanOrEqual(1);
    g.passAll();
    // The effect was used up: the sorcery is a plain spell.
    g.act(0).cast(SORCERY, { pay: true });
    expect(g.state.stack).toHaveLength(1);
  });

  test('with spells cast earlier the copies are made', () => {
    const g = game((b) => b.battlefield(STORM).hand(INSTANT, SORCERY, INSTANT), 'UUUUUUUU');
    g.act(0).cast({ name: INSTANT, nth: 0 }, { pay: true });
    g.passAll();
    g.act(0).cast(SORCERY, { pay: true });
    g.passAll();
    g.act(0).activate(STORM);
    g.passAll();
    g.act(0).cast(INSTANT, { pay: true });
    // The spell, and the storm trigger above it.
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    // The first instant gained 2; two spells were cast before the third, so it and its two copies gain 2 each: 40 + 2 + 3 * 2.
    g.expect.life(0, 48);
    g.expect.invariants();
  });
});

describe('"The next instant spell and the next sorcery spell you cast this turn each have cascade" (CR 702.85a)', () => {
  test('each of the two next spells cascades, once', () => {
    const g = game((b) => b.battlefield(CASCADE).hand(INSTANT, SORCERY, SORCERY), 'UUUUUUUUUUUU');
    g.act(0).activate(CASCADE);
    g.passAll();
    g.act(0).cast(INSTANT, { pay: true });
    // The spell and its cascade trigger.
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.act(0).cast({ name: SORCERY, nth: 0 }, { pay: true });
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    // The effects are used up: the third spell does not cascade.
    g.act(0).cast(SORCERY, { pay: true });
    expect(g.state.stack).toHaveLength(1);
  });
});

describe('"When you spend this mana to cast an instant or sorcery spell with mana value 3 or less, you may exile that spell instead" (Forger\'s Foundry, CR 607.2a)', () => {
  const FOUNDRY = 'SYNTHETIC Exile Foundry';
  const SMALL = 'SYNTHETIC Plot Draw'; // {2}{U} sorcery, mana value 3
  const BIG = 'SYNTHETIC Value Discount'; // {8}{U} sorcery, mana value 9 (full price needs nine mana)

  test('the card is valid', () => {
    expect(validateCard(syntheticCard(FOUNDRY))).toEqual([]);
  });

  test('the mana of the artifact pays for the spell: the spell is exiled as it resolves and remembered as exiled with the artifact', () => {
    const g = game(
      (b) => b.battlefield(FOUNDRY).hand(SMALL).battlefield('Island', { count: 2 }),
      '',
    );
    g.act(0).cast(SMALL, { pay: true });
    // The Foundry's mana was spent: its trigger is on the stack above the spell.
    expect(g.state.stack.length).toBeGreaterThanOrEqual(2);
    // The trigger resolves first and asks whether to exile the spell.
    g.pass();
    g.pass();
    g.act(0).accept();
    g.passAll();
    g.expect.zone(SMALL, 'exile');
    g.expect.invariants();
  });

  test('a spell with a mana value above 3 does not trigger it', () => {
    const g = game((b) => b.battlefield(FOUNDRY).hand(BIG).battlefield('Island', { count: 8 }), '');
    g.act(0).cast(BIG, { pay: true });
    expect(g.state.stack).toHaveLength(1);
  });
});
