// "{1}, {T}, Tap an untapped creature you control: Draw a card." (issue 160): the tapping of untapped permanents next to a mana cost (D-133 refused it).
// Pins: CR 118.3 (a cost that cannot be paid cannot be paid), CR 602.2b and 601.2g-h (the costs are announced and then paid in any order the player likes), CR 302.6
// (only a creature's own {T} ability is held back by summoning sickness: a fresh creature can be tapped for another cost), CR 733 (a cost can be taken back
// before it is paid). Cards are SYNTHETIC (src/cards/fixtures/synthetic-tap-cost.ts).
import { describe, expect, test } from 'vitest';
import { type Cost, getLegalActions, syntheticCard, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const SCRIBE = 'SYNTHETIC Chapel Scribe'; // 1/1: {1}, {T}, tap an untapped creature you control: draw a card
const SPRITE = 'SYNTHETIC Seed Sprite'; // 0/1: {T}: add {G}
const BEARS = 'Grizzly Bears';

const offered = (g: ScenarioGame, card: string): boolean =>
  getLegalActions(g.state, 0).some((a) => a.kind === 'activate' && a.object === g.id(card));

describe('the card is valid', () => {
  test(SCRIBE, () => {
    expect(validateCard(syntheticCard(SCRIBE))).toEqual([]);
  });
});

describe('a mana cost, {T} and the tapping of an untapped creature (CR 118.3, 602.2b)', () => {
  test('with one other creature the engine taps it, then asks for the mana; the ability draws a card', () => {
    const g = twoSeatGame((b) => b.battlefield(SCRIBE).battlefield(BEARS).battlefield('Plains'));
    expect(offered(g, SCRIBE)).toBe(true);
    g.act(0).activate(SCRIBE);
    g.expect.tapped(SCRIBE, true);
    g.expect.tapped(BEARS, true);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.tapped({ name: 'Plains', zone: 'battlefield', seat: 0 }, true);
    g.expect.invariants();
  });

  test('the source is tapped by its own {T} first, so it is not a creature it can tap for the other part of the cost', () => {
    const g = twoSeatGame((b) => b.battlefield(SCRIBE).battlefield('Plains'));
    expect(offered(g, SCRIBE)).toBe(false);
  });

  test('a creature that came under control this turn may be tapped for it (CR 302.6)', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(SCRIBE).battlefield(BEARS, { fresh: true }).battlefield('Plains'),
    );
    expect(offered(g, SCRIBE)).toBe(true);
  });

  test('a tapped creature is not one to tap, and an opponent’s is not either', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(SCRIBE).battlefield(BEARS, { tapped: true }).battlefield('Plains'),
      (b) => b.battlefield(BEARS),
    );
    expect(offered(g, SCRIBE)).toBe(false);
  });

  test('with several candidates the player chooses which to tap, before the mana is paid', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(SCRIBE).battlefield(BEARS).battlefield(SPRITE).battlefield('Plains'),
    );
    g.act(0).activate(SCRIBE);
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect(d.purpose).toBe('tap');
    expect(d.forCost).toBe(true);
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents(BEARS);
    g.expect.tapped(BEARS, true);
    g.expect.tapped(SPRITE, false);
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('the creature tapped for the cost makes no mana for the rest of it: the Sprite tapped as the cost cannot pay {1}', () => {
    const g = twoSeatGame((b) => b.battlefield(SCRIBE).battlefield(SPRITE));
    const before = g.positionHash();
    g.act(0).activate(SCRIBE);
    g.expect.tapped(SPRITE, true);
    // Nothing is left to pay {1} with: the player takes the activation back (CR 733).
    g.act(0).cancel();
    g.expect.position(before);
  });

  test('cancel takes the activation back: nothing is tapped and no mana is spent (CR 733)', () => {
    const g = twoSeatGame((b) => b.battlefield(SCRIBE).battlefield(BEARS).battlefield('Plains'));
    const before = g.positionHash();
    g.act(0).activate(SCRIBE);
    g.act(0).cancel();
    g.expect.position(before);
  });
});

const WARDEN = 'SYNTHETIC Gate Warden'; // 1/2: {T}, tap an untapped creature you control: add one mana of any color
const HOLD = 'SYNTHETIC Gate Hold'; // land: {T}: add {C}; {T}, tap an untapped creature you control: add one mana of any color
const BOLT = 'Lightning Bolt'; // {R}
const FIREBREATHER = 'SYNTHETIC Firebreather'; // {1}{R}

const plainsOnField = { name: 'Plains', zone: 'battlefield' as const, seat: 0 as const };

const activations = (g: ScenarioGame, card: string) =>
  getLegalActions(g.state, 0).filter(
    (a) => a.kind === 'activateAbility' && a.source === g.id(card),
  );

describe('the mana abilities are valid', () => {
  test.each([WARDEN, HOLD])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('a mana ability that taps an untapped creature (CR 605.1a, 118.3, 605.3b)', () => {
  test('with one creature to tap, tapping for mana taps the source and that creature, and makes one mana of the color asked', () => {
    const g = twoSeatGame((b) => b.battlefield(WARDEN).battlefield(BEARS));
    g.act(0).tapForMana(WARDEN, { color: 'R' });
    g.expect.tapped(WARDEN, true);
    g.expect.tapped(BEARS, true);
    expect(g.state.seats[0]?.manaPool).toHaveLength(1);
    expect(g.state.seats[0]?.manaPool[0]?.color).toBe('R');
    g.expect.invariants();
  });

  test('a mana ability is not a stack object: the opponent cannot respond and nothing waits on the stack (CR 605.3b)', () => {
    const g = twoSeatGame((b) => b.battlefield(WARDEN).battlefield(BEARS));
    g.act(0).tapForMana(WARDEN, { color: 'G' });
    expect(g.state.stack).toHaveLength(0);
  });

  test('alone it taps nothing else, so the ability is not offered; the source itself cannot be the creature tapped', () => {
    const g = twoSeatGame((b) => b.battlefield(WARDEN));
    expect(activations(g, WARDEN)).toHaveLength(0);
  });

  test('a creature that came under control this turn may be tapped for it (CR 302.6), but the source itself needs to be free of summoning sickness', () => {
    const fresh = twoSeatGame((b) => b.battlefield(WARDEN).battlefield(BEARS, { fresh: true }));
    expect(activations(fresh, WARDEN).length).toBeGreaterThan(0);
    const sick = twoSeatGame((b) => b.battlefield(WARDEN, { fresh: true }).battlefield(BEARS));
    expect(activations(sick, WARDEN)).toHaveLength(0);
  });

  test('a tapped creature and an opponent’s creature are not candidates', () => {
    const g = twoSeatGame(
      (b) => b.battlefield(WARDEN).battlefield(BEARS, { tapped: true }),
      (b) => b.battlefield(BEARS),
    );
    expect(activations(g, WARDEN)).toHaveLength(0);
  });

  test('with several candidates every one is an option of its own, and an activation that names none is refused', () => {
    const g = twoSeatGame((b) =>
      b.battlefield(WARDEN).battlefield(BEARS).battlefield(SPRITE, { label: 'sprite' }),
    );
    const options = activations(g, WARDEN).filter(
      (a) => a.kind === 'activateAbility' && a.color === 'G',
    );
    expect(options).toHaveLength(2);
    expect(options.map((a) => (a.kind === 'activateAbility' ? a.tapped : null)).sort()).toEqual(
      [g.id(BEARS), g.id(SPRITE)].sort(),
    );
    expect(g.act(0).try.tapForMana(WARDEN, { color: 'G' }).ok).toBe(false);
    g.act(0).tapForMana(WARDEN, { color: 'G', tapped: BEARS });
    g.expect.tapped(WARDEN, true);
    g.expect.tapped(BEARS, true);
    g.expect.tapped(SPRITE, false);
  });

  test('a permanent that is not a candidate cannot be named', () => {
    const g = twoSeatGame((b) => b.battlefield(WARDEN).battlefield(BEARS).battlefield('Plains'));
    expect(g.act(0).try.tapForMana(WARDEN, { color: 'G', tapped: plainsOnField }).ok).toBe(false);
  });

  test('a land with the ability: the first ability needs no creature, the second one does', () => {
    const alone = twoSeatGame((b) => b.battlefield(HOLD));
    expect(
      activations(alone, HOLD).every((a) => a.kind === 'activateAbility' && a.abilityIndex === 0),
    ).toBe(true);
    const withCreature = twoSeatGame((b) => b.battlefield(HOLD).battlefield(BEARS));
    withCreature.act(0).tapForMana(HOLD, { ability: 1, color: 'W' });
    withCreature.expect.tapped(HOLD, true);
    withCreature.expect.tapped(BEARS, true);
  });
});

describe('paying a cost with it', () => {
  const castGame = () =>
    scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield(HOLD)
      .battlefield(BEARS)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .seat(1)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the player can pay by naming it: the land and the creature are tapped and the {R} pays the spell', () => {
    const g = castGame();
    const cast = g.act(0).cast(BOLT, { targets: [{ player: 1 }] });
    g.expect.pending('payMana', 0);
    cast.payManual([{ source: HOLD, ability: 1, color: 'R', tapped: BEARS }]);
    g.expect.tapped(HOLD, true);
    g.expect.tapped(BEARS, true);
    g.passAll();
    g.expect.life(1, 37);
  });

  test('automatic payment uses it too, tapping the creature itself', () => {
    const g = castGame();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.tapped(HOLD, true);
    g.expect.tapped(BEARS, true);
    g.passAll();
    g.expect.life(1, 37);
  });

  const twoMana = (...mine: string[]) =>
    scenario()
      .seat(0)
      .hand(FIREBREATHER)
      .battlefield(...mine)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .seat(1)
      .library(...Array.from({ length: 6 }, () => 'Plains'))
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  const castable = (g: ScenarioGame) =>
    getLegalActions(g.state, 0).some(
      (a) => a.kind === 'castSpell' && a.object === g.id(FIREBREATHER),
    );

  test('automatic payment never taps a creature that another source of the plan taps for mana', () => {
    // {1}{R} from the Warden and the Sprite: the Warden would have to tap the Sprite, which makes the other mana. No plan taps a creature twice.
    expect(castable(twoMana(WARDEN, SPRITE))).toBe(false);
    // With a third creature to tap the plan exists.
    const g = twoMana(WARDEN, SPRITE, BEARS);
    expect(castable(g)).toBe(true);
    g.act(0).cast(FIREBREATHER, { pay: true });
    g.expect.tapped(BEARS, true);
  });
});

describe('what a mana ability may say (D-625)', () => {
  const messages = (card: ReturnType<typeof syntheticCard>) =>
    validateCard(card)
      .map((m) => m.message)
      .join(' | ');
  const withManaCost = (costs: readonly Cost[]) => {
    const card = syntheticCard(WARDEN);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    return {
      ...card,
      faces: [
        {
          ...face,
          abilities: [
            { kind: 'mana' as const, cost: costs, production: { kind: 'anyColor' as const } },
          ],
        },
      ],
    };
  };
  const tap = (count: number): Cost => ({
    kind: 'tapPermanents',
    filter: { types: ['creature'] },
    count,
  });

  test('one permanent besides the source', () => {
    expect(messages(withManaCost([{ kind: 'tap' }, tap(1)]))).toBe('');
    expect(messages(withManaCost([{ kind: 'tap' }, tap(2)]))).toMatch(/one permanent/);
  });

  test('not with a sacrifice: two choices to name', () => {
    const sacrifice: Cost = { kind: 'sacrifice', what: { types: ['artifact'] } };
    expect(messages(withManaCost([{ kind: 'tap' }, tap(1), sacrifice]))).toMatch(
      /does not also sacrifice/,
    );
  });
});
