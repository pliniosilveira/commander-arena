// "When this enters, you may cast target instant or sorcery card from a graveyard, and mana of any type can be spent to cast that spell. If that spell would be put
// into a graveyard, exile it instead." (D-350 to D-354, group 3-c of the Niv-Mizzet deck): the effect `castCard` and its two riders.
// Pins: CR 115.1 and 601.2c (the target is a card in a graveyard, of any player), CR 608.2b (a target that left its graveyard is gone), CR 608.2g (the cast is part of the
// resolution: the steps of CR 601.2a-i, no timing restriction, no player receives priority, the resolution goes on), CR 601.2f-h (the mana cost is paid; additional costs
// too), CR 609.4b (mana of any type: colored and colorless symbols, hybrid and Phyrexian, but not the snow of {S}), CR 614.1a (the exile replaces the move to a graveyard,
// resolved or countered), CR 108.3 and 400.7 (the card keeps its owner; exile belongs to nobody), CR 733 (a cast can be taken back).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-niv-group-3-c.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import {
  checkInvariants,
  getView,
  isFeatureSupported,
  syntheticCard,
  validateCard,
} from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';
import { confirmOptionalDecision, targetsDecision } from './pending-helpers';

const CASTER = 'SYNTHETIC Graveyard Caster'; // {2}{U} 2/2: castCard with any type of mana and exile instead (the shape of the real card)
const PLAIN = 'SYNTHETIC Plain Graveyard Caster'; // castCard, no riders
const ANY = 'SYNTHETIC Any Mana Caster'; // castCard, mana of any type
const EXILE = 'SYNTHETIC Exile Instead Caster'; // castCard, exile instead
const SNOWY = 'SYNTHETIC Snowy Study'; // {S}{S} sorcery, draw a card
const COLORLESS = 'SYNTHETIC Colorless Study'; // {1}{C} sorcery, draw a card
const MIXED = 'SYNTHETIC Mixed Study'; // {W/U}{B/P} sorcery, draw a card
const BLOODY = 'SYNTHETIC Bloody Study'; // {U} sorcery, sacrifice a creature as an additional cost, draw a card
const BEAR = 'SYNTHETIC Quiet Bear'; // a creature card: never a target
const BOLT = 'Lightning Bolt'; // {R} instant, 3 damage to any target
const DIVINATION = 'Divination'; // {2}{U} sorcery, draw two
const COUNTERSPELL = 'Counterspell'; // {U}{U} instant
const MURDER = 'Murder'; // {1}{B}{B} instant
const FILLER = Array.from({ length: 12 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

/**
 * Seat 0's precombat main phase of turn 3 with `creature` in the hand and five lands: an Island and two Swamps first (which pay the creature, {2}{U}, being the
 * lands the planner taps first), then `rest` (three Mountains by default). Seat 1 gets what `theirs` adds.
 */
function game(
  creature: string,
  mine: (b: Builder) => Builder = (b) => b,
  theirs: (b: Builder) => Builder = (b) => b,
  rest: (b: Builder) => Builder = (b) => b.battlefield('Mountain', { count: 3 }),
): ScenarioGame {
  const first = scenario()
    .seat(0)
    .life(20)
    .hand(creature)
    .battlefield('Island')
    .battlefield('Swamp', { count: 2 });
  const a = mine(rest(first)).library(...FILLER);
  return theirs(
    a
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

/** The creature is cast and its trigger resolves with `target` chosen: the question "cast it?" is asked. */
function toQuestion(g: ScenarioGame, creature: string, target?: Parameters<ScenarioGame['id']>[0]) {
  g.act(0).cast(creature, { pay: true });
  resolveTop(g); // the creature spell resolves; its trigger goes on the stack (and asks for a target when there are several)
  if (g.state.pending?.kind === 'targets') {
    g.act(0).chooseTargets(target ?? BOLT);
  }
  resolveTop(g); // the trigger resolves
}

describe('the cards are valid, and the effect is a supported feature', () => {
  test.each([CASTER, PLAIN, ANY, EXILE, SNOWY, COLORLESS, MIXED, BLOODY, BEAR])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });

  test('castCard is listed as a supported effect', () => {
    expect(isFeatureSupported('effect:castCard')).toBe(true);
  });

  test('castCard names a target of the ability, with riders that are true when present', () => {
    const card = syntheticCard(CASTER);
    const face = card.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no ability');
    const withEffect = (effect: unknown) =>
      ({ ...card, faces: [{ ...face, abilities: [{ ...ability, effect }] }] }) as never;
    expect(
      validateCard(withEffect({ kind: 'castCard', object: { kind: 'target', id: 't1' } })),
    ).toEqual([]);
    // Not a target nobody declared.
    expect(
      validateCard(withEffect({ kind: 'castCard', object: { kind: 'target', id: 'x9' } })).length,
    ).toBeGreaterThan(0);
    // The card to cast is a target, not "this" or a selector.
    expect(
      validateCard(withEffect({ kind: 'castCard', object: { kind: 'this' } })).length,
    ).toBeGreaterThan(0);
    // The riders are true or absent.
    expect(
      validateCard(
        withEffect({
          kind: 'castCard',
          object: { kind: 'target', id: 't1' },
          anyManaType: false,
        }),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withEffect({
          kind: 'castCard',
          object: { kind: 'target', id: 't1' },
          exileInstead: false,
        }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('the target: an instant or sorcery card in any graveyard (CR 115.1, 601.2c)', () => {
  test('both graveyards are offered, and a creature card or a card on the battlefield is not', () => {
    const g = game(
      CASTER,
      (b) => b.graveyard(DIVINATION, BEAR),
      (b) => b.graveyard(BOLT).battlefield('Grizzly Bears'),
    );
    g.act(0).cast(CASTER, { pay: true });
    resolveTop(g);
    const d = targetsDecision(g);
    expect(d.forTrigger).toBe(true);
    const legal = d.specs[0]?.legal ?? [];
    expect(legal).toHaveLength(2);
    expect(legal).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'object', id: g.id(DIVINATION) }),
        expect.objectContaining({ kind: 'object', id: g.id(BOLT) }),
      ]),
    );
  });

  test('with no instant or sorcery card in a graveyard the trigger has no target and is removed', () => {
    const g = game(CASTER, (b) => b.graveyard(BEAR));
    g.act(0).cast(CASTER, { pay: true });
    resolveTop(g);
    g.expect.stack([]);
    g.expect.pending('priority', 0);
  });
});

describe('the question and the cast (CR 608.2g): the mana cost is paid, no priority in between', () => {
  test("a card of the opponent's graveyard is asked about, with the card as the subject, and the cast is the caster's", () => {
    const g = game(
      CASTER,
      (b) => b,
      (b) => b.graveyard(BOLT),
    );
    toQuestion(g, CASTER);
    const d = confirmOptionalDecision(g);
    expect(d.purpose).toBe('castCard');
    expect(d.seat).toBe(0);
    expect(d.subject).toBe(g.id(BOLT));
    g.act(0).accept();
    // The Bolt's own target, then its cost: {R}, paid from a Mountain.
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    // CR 608.2g: the trigger is done and nobody got priority; the Bolt is on the stack, controlled by the caster.
    g.expect.stack([BOLT]);
    g.expect.eventLog([{ kind: 'spellCast', seat: 0, fromZone: 'graveyard' }]);
    const spell = getView(g.state, 0).stack[0];
    expect(spell?.controller).toBe(0);
    expect(spell?.owner).toBe(1);
    expect(g.state.battlefield.filter((id) => g.state.objects[id]?.tapped === true)).toHaveLength(
      4,
    );
    g.expect.pending('priority', 0);
    expect(checkInvariants(g.state)).toEqual([]);
    resolveTop(g);
    g.expect.life(1, 17);
  });

  test('the card of the opponent keeps its owner: it goes to exile, nobody’s zone, when it leaves the stack', () => {
    const g = game(
      CASTER,
      (b) => b,
      (b) => b.graveyard(BOLT),
    );
    toQuestion(g, CASTER);
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    resolveTop(g);
    g.expect.zone(BOLT, 'exile', { seat: 1 });
    g.expect.noObject(BOLT, { zone: 'graveyard' });
    expect(g.state.seats[1]?.graveyard).toEqual([]);
    expect(getView(g.state, 0).exile.find((o) => o.name === BOLT)?.owner).toBe(1);
  });

  test('the cost is the mana cost of the card: {2}{U} for Divination, the caster’s cards are drawn', () => {
    const g = game(CASTER, (b) => b.graveyard(DIVINATION));
    toQuestion(g, CASTER);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.stack([DIVINATION]);
    const before = getView(g.state, 0).seats[0]?.handCount;
    resolveTop(g);
    expect(getView(g.state, 0).seats[0]?.handCount).toBe((before ?? 0) + 2);
    g.expect.zone(DIVINATION, 'exile', { seat: 0 });
  });

  test('declining leaves the card in its graveyard and ends the effect', () => {
    const g = game(CASTER, (b) => b.graveyard(DIVINATION));
    toQuestion(g, CASTER);
    g.act(0).decline();
    g.expect.zone(DIVINATION, 'graveyard', { seat: 0 });
    g.expect.stack([]);
    g.expect.pending('priority', 0);
    g.expect.eventLog([{ kind: 'optionalAnswered', seat: 0, accepted: false }]);
  });

  test('the cast can be taken back (CR 733): cancelling asks the question again, nothing is paid', () => {
    const g = game(CASTER, (b) => b.graveyard(DIVINATION));
    toQuestion(g, CASTER);
    g.act(0).accept();
    g.expect.pending('payMana', 0);
    g.act(0).cancel();
    expect(confirmOptionalDecision(g).purpose).toBe('castCard');
    g.expect.zone(DIVINATION, 'graveyard', { seat: 0 });
    expect(
      g.state.battlefield.filter(
        (id) => g.state.objects[id]?.tapped === true && g.state.objects[id]?.zone === 'battlefield',
      ),
    ).toHaveLength(3);
    // Again, and this time it is cast.
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.stack([DIVINATION]);
  });

  test('a card that cannot be paid for is not asked about: nothing happens and it stays', () => {
    // {2}{U} for Divination with one Island and two Swamps tapped for the creature and no other land: nothing is left to pay with.
    const g = game(
      CASTER,
      (b) => b.graveyard(DIVINATION),
      (b) => b,
      (b) => b,
    );
    toQuestion(g, CASTER);
    g.expect.pending('priority', 0);
    g.expect.zone(DIVINATION, 'graveyard', { seat: 0 });
    g.expect.stack([]);
  });

  test('the card’s own targets and cost are checked before asking: Murder is asked about with three Swamps and a creature to target (the caster)', () => {
    const g = game(
      CASTER,
      (b) => b.graveyard(MURDER),
      (b) => b,
      (b) => b.battlefield('Swamp', { count: 3 }),
    );
    toQuestion(g, CASTER);
    expect(confirmOptionalDecision(g).purpose).toBe('castCard');
    g.act(0).accept();
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets(CASTER);
    g.act(0).payAuto();
    resolveTop(g);
    g.expect.zone(CASTER, 'graveyard', { seat: 0 });
    g.expect.zone(MURDER, 'exile', { seat: 0 });
  });

  test('the cast of a spell whose cost has an additional cost asks for it: Bloody Study sacrifices the caster itself', () => {
    const g = game(CASTER, (b) => b.graveyard(BLOODY));
    toQuestion(g, CASTER);
    g.act(0).accept();
    g.act(0).payAuto();
    // The additional cost: a creature to sacrifice (the only one is the caster, so it is chosen, or asked).
    if (g.state.pending?.kind === 'choosePermanent') g.act(0).choosePermanents(CASTER);
    g.expect.stack([BLOODY]);
    g.expect.zone(CASTER, 'graveyard', { seat: 0 });
    resolveTop(g);
    g.expect.zone(BLOODY, 'exile', { seat: 0 });
  });
});

describe('"mana of any type can be spent to cast that spell" (CR 609.4b)', () => {
  const mountainsOnly = (b: Builder) => b.battlefield('Mountain', { count: 3 });

  test('with the permission Divination’s {U} is paid by Mountains; without it nothing is offered', () => {
    const withIt = game(ANY, (b) => b.graveyard(DIVINATION));
    toQuestion(withIt, ANY);
    expect(confirmOptionalDecision(withIt).purpose).toBe('castCard');
    withIt.act(0).accept();
    withIt.act(0).payAuto();
    withIt.expect.stack([DIVINATION]);

    const without = game(
      PLAIN,
      (b) => b.graveyard(DIVINATION),
      (b) => b,
      mountainsOnly,
    );
    toQuestion(without, PLAIN);
    without.expect.pending('priority', 0);
    without.expect.zone(DIVINATION, 'graveyard', { seat: 0 });
  });

  test('the spell on the stack remembers it (the payment is made after the question)', () => {
    const g = game(ANY, (b) => b.graveyard(DIVINATION));
    toQuestion(g, ANY);
    g.act(0).accept();
    const casting = g.state.casting?.object;
    expect(casting).toBeDefined();
    expect(casting === undefined ? undefined : g.state.objects[casting]?.stack?.anyManaType).toBe(
      true,
    );
    // Paying by hand, naming the lands, pays the same way.
    const mountains = g.find({ name: 'Mountain', zone: 'battlefield' });
    g.act(0).choose({
      kind: 'payManual',
      taps: mountains.map((m) => ({ object: m.id, abilityIndex: 0 })),
    });
    g.expect.stack([DIVINATION]);
  });

  test('a colorless symbol {C} is paid by a Mountain', () => {
    const g = game(ANY, (b) => b.graveyard(COLORLESS));
    toQuestion(g, ANY);
    expect(confirmOptionalDecision(g).purpose).toBe('castCard');
    const plain = game(PLAIN, (b) => b.graveyard(COLORLESS));
    toQuestion(plain, PLAIN);
    plain.expect.pending('priority', 0);
  });

  test('a hybrid and a Phyrexian symbol are paid by any two mana', () => {
    const g = game(
      ANY,
      (b) => b.graveyard(MIXED),
      (b) => b,
      (b) => b.battlefield('Mountain', { count: 2 }),
    );
    toQuestion(g, ANY);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.stack([MIXED]);
    g.expect.life(0, 20);
  });

  test('a snow symbol is not about the type: {S}{S} needs snow mana, whatever it is', () => {
    const g = game(ANY, (b) => b.graveyard(SNOWY));
    toQuestion(g, ANY);
    g.expect.pending('priority', 0);
    const snowy = game(
      ANY,
      (b) => b.graveyard(SNOWY),
      (b) => b,
      (b) => b.battlefield('SYNTHETIC Snow Plains', { count: 2 }),
    );
    toQuestion(snowy, ANY);
    expect(confirmOptionalDecision(snowy).purpose).toBe('castCard');
  });

  test('the permission is for that one spell: a spell of the same card cast from the hand pays as usual', () => {
    const g = game(
      ANY,
      (b) => b.graveyard(DIVINATION).hand(DIVINATION),
      (b) => b,
      (b) => b.battlefield('Mountain', { count: 6 }),
    );
    toQuestion(g, ANY);
    g.act(0).accept();
    g.act(0).payAuto();
    resolveTop(g);
    // Three Mountains are left, with no blue mana among them: the Divination in the hand cannot be cast.
    g.expect.illegal(0, { cast: { name: DIVINATION, zone: 'hand', seat: 0 } });
  });
});

describe('"If that spell would be put into a graveyard, exile it instead" (CR 614.1a)', () => {
  test('a resolved spell goes to exile, not to its owner’s graveyard', () => {
    const g = game(EXILE, (b) => b.graveyard(BOLT));
    toQuestion(g, EXILE);
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    resolveTop(g);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.noObject(BOLT, { zone: 'graveyard' });
    g.expect.life(1, 17);
  });

  test('a countered spell goes to exile as well', () => {
    const g = game(
      EXILE,
      (b) => b.graveyard(BOLT),
      (b) => b.hand(COUNTERSPELL).battlefield('Island', { count: 2 }),
    );
    toQuestion(g, EXILE);
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    g.act(0).pass();
    g.act(1).cast(COUNTERSPELL, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.life(1, 20);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.expect.zone(COUNTERSPELL, 'graveyard', { seat: 1 });
  });

  test('without the rider the same spell goes to its owner’s graveyard, as any spell: the owner is the opponent', () => {
    const g = game(
      PLAIN,
      (b) => b,
      (b) => b.graveyard(BOLT),
    );
    toQuestion(g, PLAIN);
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    resolveTop(g);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.noObject(BOLT, { zone: 'exile' });
  });

  test('a spell cast from the hand in the same game is not exiled: the rider is on that one spell', () => {
    const g = game(
      EXILE,
      (b) => b.graveyard(BOLT).hand(BOLT),
      (b) => b,
      (b) => b.battlefield('Mountain', { count: 4 }),
    );
    toQuestion(g, EXILE);
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    resolveTop(g);
    g.expect.zone(BOLT, 'exile', { seat: 0 });
    g.act(0).cast({ name: BOLT, zone: 'hand', seat: 0 }, { targets: [{ player: 1 }], pay: true });
    resolveTop(g);
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.life(1, 14);
  });

  test('a card exiled this way is a new object, not bound to the rider (CR 400.7)', () => {
    const g = game(EXILE, (b) => b.graveyard(BOLT));
    toQuestion(g, EXILE);
    g.act(0).accept();
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    const stackId = g.id(BOLT);
    resolveTop(g);
    const exiled = g.find({ name: BOLT, zone: 'exile' })[0];
    expect(exiled?.id).not.toBe(stackId);
    expect(exiled === undefined ? undefined : g.state.objects[exiled.id]?.stack).toBeFalsy();
  });
});
