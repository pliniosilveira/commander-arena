// "Double the value of X" and "copy that spell or ability" (Quandrix Unlimited deck, group I: the engine's `doubleSpellX`, and `copySpell` of the activated ability that caused an
// `activatesAbility` trigger with `xCost`).
// Pins: CR 107.3 and 107.3a (the X announced for a spell or ability; while it is on the stack every X in it is that value), CR 107.3m (the permanent enters with the X of the spell),
// CR 601.2f (the cost paid stays what it was), CR 602.2 and 605.1a (an activated ability uses the stack, a mana ability does not), CR 603.2 and 603.4 (the trigger, with its "if" about the
// event), CR 707.10 and 707.10c (a copy of a spell or an ability has the choices made for it, is controlled by who has it put on the stack, may have new targets, and is not cast or
// activated), CR 113.7a (an ability on the stack is independent of its source).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-unbound-i.ts, synthetic-x.ts, synthetic-gisa-g2.ts) or real fixtures (Grizzly Bears, Lightning Bolt, Llanowar Elves).
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const DOUBLER = 'SYNTHETIC Unbound Doubler';
const CUB = 'SYNTHETIC Hydra Cub'; // {X}{G}: enters with X +1/+1 counters
const BURN = 'SYNTHETIC X Burn'; // {X}{R}: X damage to any target
const CANNON = 'SYNTHETIC X Cannon'; // {X},{T}: X damage to target creature
const LANCE = 'SYNTHETIC Blood Lance'; // Pay X life: X damage to target creature
const NEEDLE = 'SYNTHETIC Needle Rogue'; // {T}: 1 damage to target creature
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const LIBRARY = Array.from({ length: 10 }, () => 'Swamp');

const game = (
  hand: readonly string[],
  board: readonly string[],
  opponent: readonly string[] = [],
) =>
  scenario()
    .define(syntheticCard(DOUBLER))
    .seat(0)
    .library(...LIBRARY)
    .hand(...hand)
    .battlefield(DOUBLER)
    .battlefield(...board)
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...opponent)
    .at('precombatMain', { active: 0 })
    .build();

describe('the card is valid', () => {
  test(DOUBLER, () => {
    expect(validateCard(syntheticCard(DOUBLER))).toEqual([]);
  });

  test('the flags of the activation trigger are true when present', () => {
    const base = syntheticCard(DOUBLER);
    const face = base.faces[0];
    const ability = face?.abilities[2];
    if (face === undefined || ability === undefined) throw new Error('no ability');
    const withFlag = (xCost: unknown) => ({
      ...base,
      faces: [
        {
          ...face,
          abilities: [{ ...ability, trigger: { kind: 'activatesAbility', who: 'you', xCost } }],
        },
      ],
    });
    expect(validateCard(withFlag(true) as never)).toEqual([]);
    expect(validateCard(withFlag(false) as never).length).toBeGreaterThan(0);
  });

  test('doubleSpellX names the spell of the trigger and nothing else', () => {
    const base = syntheticCard(DOUBLER);
    const face = base.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability === undefined) throw new Error('no ability');
    const withSpell = (spell: unknown) => ({
      ...base,
      faces: [{ ...face, abilities: [{ ...ability, effect: { kind: 'doubleSpellX', spell } }] }],
    });
    expect(validateCard(withSpell({ kind: 'triggerSubject' }) as never)).toEqual([]);
    expect(validateCard(withSpell({ kind: 'this' }) as never).length).toBeGreaterThan(0);
  });
});

describe('"Whenever you cast a permanent spell with a mana cost that contains {X}, double the value of X."', () => {
  test('the creature enters with twice the X it was cast with, and only X was paid for (CR 107.3m, 601.2f)', () => {
    const g = game([CUB], ['Forest', 'Forest', 'Forest']);
    g.act(0).cast(CUB).x(2).pay();
    g.expect.stack([`${DOUBLER} (ability)`, CUB]);
    g.passAll();
    g.expect.counters(CUB, { '+1/+1': 4 });
    g.expect.zone('Forest', 'battlefield', { seat: 0, count: 3 });
    g.expect.invariants();
  });

  test('X = 0 stays 0: the creature is a plain 1/1', () => {
    const g = game([CUB], ['Forest']);
    g.act(0).cast(CUB).pay(); // only {G} is affordable: X is 0, nothing is asked
    g.passAll();
    g.expect.counters(CUB, {});
  });

  test('a spell with no {X} in its mana cost is not doubled', () => {
    const g = game([BEARS], ['Forest', 'Forest']);
    g.act(0).cast(BEARS).pay();
    g.expect.stack([BEARS]);
  });

  test('an instant is no permanent spell: its X is not doubled (it is copied instead)', () => {
    const g = game([BURN], ['Mountain', 'Mountain', 'Mountain']);
    g.act(0).cast(BURN, { x: 2, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(1, 36); // 2 and 2: neither was doubled
  });
});

describe('"Whenever you cast an instant or sorcery spell ..., if that spell\'s mana cost ... contains {X}, copy that spell."', () => {
  test('the copy has the X and the target of the spell, and may be aimed anew (CR 707.10, 707.10c)', () => {
    const g = game([BURN], ['Mountain', 'Mountain', 'Mountain']);
    const mark = g.mark();
    g.act(0).cast(BURN, { x: 2, targets: [{ player: 1 }], pay: true });
    g.expect.stack([`${DOUBLER} (ability)`, BURN]);
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 0 });
    g.expect.stack([BURN, BURN]);
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'spellCopied')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'spellCast')).toHaveLength(1); // the copy is not cast
    g.passAll();
    g.expect.life(1, 38);
    g.expect.life(0, 38);
    g.expect.invariants();
  });

  test('a spell with no {X} in its mana cost is not copied', () => {
    const g = game([BOLT], ['Mountain']);
    g.act(0)
      .cast(BOLT, { targets: [{ player: 1 }] })
      .pay();
    g.expect.stack([BOLT]);
  });
});

describe('"Whenever you ... activate an ability, if that ability\'s activation cost contains {X}, copy that ability."', () => {
  const board = () => game([], [CANNON, 'Island', 'Island'], [BEARS, BEARS]);

  test('the copy of the ability has its X and may take another target; it is not activated (CR 707.10)', () => {
    const g = board();
    const mark = g.mark();
    g.act(0).activate(CANNON, { x: 2, targets: ['Grizzly Bears[0]'], pay: true });
    g.expect.stack([`${DOUBLER} (ability)`, `${CANNON} (ability)`]);
    g.pass();
    g.pass();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets('Grizzly Bears[1]');
    g.expect.stack([`${CANNON} (ability)`, `${CANNON} (ability)`]);
    const events = g.eventsSince(mark);
    expect(events.filter((e) => e.kind === 'spellCopied')).toHaveLength(1);
    expect(events.filter((e) => e.kind === 'abilityActivated')).toHaveLength(1);
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1, count: 2 }); // 2 damage each
    g.expect.invariants();
  });

  test('an ability with no {X} in its cost is not copied', () => {
    const g = game([], [NEEDLE], [BEARS]);
    g.act(0).activate(NEEDLE, { targets: ['Grizzly Bears'] });
    g.expect.stack([`${NEEDLE} (ability)`]);
  });

  test('"Pay X life" is no {X}: that ability is not copied', () => {
    const g = game([], [LANCE], [BEARS]);
    g.act(0).activate(LANCE, { x: 1, targets: ['Grizzly Bears'] });
    g.expect.stack([`${LANCE} (ability)`]);
  });

  test('a mana ability never uses the stack, so it triggers nothing', () => {
    const g = game([], [ELVES]);
    g.act(0).tapForMana(ELVES);
    g.expect.stack([]);
  });

  test('an opponent activating an ability with {X} does not trigger it', () => {
    const g = scenario()
      .define(syntheticCard(DOUBLER))
      .seat(0)
      .library(...LIBRARY)
      .battlefield(DOUBLER)
      .battlefield(BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(CANNON, 'Island', 'Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).activate(CANNON, { x: 2, targets: ['Grizzly Bears'], pay: true });
    g.expect.stack([`${CANNON} (ability)`]);
  });
});
