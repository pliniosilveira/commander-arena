// Madness (CR 702.35, D-128): "If a player would discard this card, that player discards it, but exiles it instead
// of putting it into their graveyard" and "When this card is exiled this way, its owner may cast it by paying [cost]
// rather than paying its mana cost. If that player doesn't, they put this card into their graveyard."
// Pins: CR 702.35a (both abilities; the exile is not optional, the cast is), 702.35b (an alternative cost, 601.2b and
// 601.2f-h), 701.9 (discard), 118.9 (alternative cost), 608.2g (cast during a resolution: no priority), 903.9a (a
// commander in exile may go to the command zone), 514.1 (cleanup discard), 702.29 (cycling discards), 601.2h (a
// discard as a cost), 400.7 (a card that moved is a new object). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-later.ts).
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  getView,
  isFeatureSupported,
  stateHash,
  syntheticCard,
  validateCard,
} from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const FIEND = 'SYNTHETIC Madness Fiend'; // {3}{B} 4/3, madness {1}{B}
const BOLT = 'SYNTHETIC Madness Bolt'; // {1}{R} instant, 3 damage to target creature, madness {R}
const CYCLER = 'SYNTHETIC Madness Cycler'; // {4}{B} 4/4, cycling {1}, madness {B}
const COMMANDER = 'SYNTHETIC Madness Commander'; // {2}{B} legendary 3/3, madness {B}
const ROT = 'SYNTHETIC Mind Rot'; // {1}{B} sorcery, each opponent discards two cards
const NIBBLE = 'SYNTHETIC Mind Nibble'; // {B} sorcery, each opponent discards a card
const RUMMAGE = 'SYNTHETIC Rummage Spell'; // {R} instant, discard a card as an additional cost, draw a card
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

type Builder = ReturnType<typeof scenario>;

/** Seat 0 holds Mind Nibble and a Swamp pair; seat 1 (`defender`) gets the rest. Seat 0's precombat main phase. */
function rot(defender: (b: Builder) => Builder, spell = NIBBLE): ScenarioGame {
  const mine = scenario()
    .seat(0)
    .life(20)
    .hand(spell)
    .battlefield('Swamp', { count: 2 })
    .library(...FILLER);
  const g = defender(
    mine
      .seat(1)
      .life(20)
      .library(...FILLER),
  )
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast(spell, { pay: true });
  g.pass();
  g.pass();
  return g;
}

const resolveTop = (g: ScenarioGame): void => {
  g.pass();
  g.pass();
};

const swamps = (b: Builder, n = 2) => b.battlefield('Swamp', { count: n });

describe('the replacement: exiled instead of the graveyard (CR 702.35a)', () => {
  test('a card with madness discarded by an effect is in exile, not in the graveyard', () => {
    const g = rot((b) => swamps(b.hand(FIEND)));
    g.expect.zone(FIEND, 'exile', { seat: 1 });
    g.expect.noObject(FIEND, { zone: 'graveyard' });
    g.expect.noObject(FIEND, { zone: 'hand' });
  });

  test('it is still discarded: the events say so, and the exile is public', () => {
    const g = rot((b) => swamps(b.hand(FIEND)));
    g.expect.eventLog([
      { kind: 'zoneChanged', fromZone: 'hand', toZone: 'exile' },
      { kind: 'discarded', seat: 1 },
      { kind: 'madnessExiled', seat: 1 },
    ]);
    expect(getView(g.state, 0).exile.find((o) => o.name === FIEND)?.owner).toBe(1);
  });

  test('a card without madness goes to the graveyard as always', () => {
    const g = rot((b) => swamps(b.hand('Grizzly Bears')));
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.noEvent({ kind: 'madnessExiled' });
    g.expect.stack([]);
  });

  test('the player chooses which card to discard, and the replacement follows the card', () => {
    const g = rot((b) => swamps(b.hand(FIEND, 'Grizzly Bears')));
    g.act(1).chooseCards('Grizzly Bears');
    g.expect.zone(FIEND, 'hand', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('the view of the card in the hand lists no madness cast: it is never cast from a hand', () => {
    const g = rot((b) => swamps(b.hand(FIEND, 'Grizzly Bears')));
    const card = getView(g.state, 1).seats[1]?.hand?.find((o) => o.name === FIEND);
    expect(card?.alternativeCosts).toBeUndefined();
    g.expect.illegal(1, { cast: FIEND, alternative: 'madness' });
  });
});

describe('the trigger: "its owner may cast it by paying [cost]" (CR 702.35a, 702.35b)', () => {
  test('it goes on the stack, controlled by the owner of the card, and can be responded to', () => {
    const g = rot((b) => swamps(b.hand(FIEND)));
    g.expect.stack([`${FIEND} (ability)`]);
    expect(getView(g.state, 0).stack[0]?.controller).toBe(1);
    expect(getView(g.state, 0).stack[0]?.abilitySource).toBe(
      g.find({ name: FIEND, zone: 'exile' })[0]?.id,
    );
  });

  test('resolving it asks the owner, with the madness cost; accepting casts the card for that cost', () => {
    const g = rot((b) => swamps(b.hand(FIEND)));
    resolveTop(g);
    const d = g.state.pending;
    expect(d?.kind).toBe('confirmOptional');
    if (d?.kind === 'confirmOptional') {
      expect(d.purpose).toBe('madness');
      expect(d.seat).toBe(1);
      expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1', 'B'] }]);
    }
    g.act(1).accept();
    g.expect.pending('payMana', 1);
    g.act(1).payAuto();
    // CR 608.2g: no player received priority; the spell is on the stack and the ability is done.
    g.expect.stack([FIEND]);
    g.expect.eventLog([{ kind: 'spellCast', seat: 1, fromZone: 'exile', alternative: 'madness' }]);
    expect(getView(g.state, 0).stack[0]?.alternative).toBe('madness');
    expect(
      g.state.battlefield.filter(
        (id) => g.state.objects[id]?.controller === 1 && g.state.objects[id]?.tapped,
      ),
    ).toHaveLength(2);
    g.expect.invariants();
    resolveTop(g);
    g.expect.zone(FIEND, 'battlefield', { seat: 1 });
  });

  test('declining puts the card into its owner’s graveyard', () => {
    const g = rot((b) => swamps(b.hand(FIEND)));
    resolveTop(g);
    g.act(1).decline();
    g.expect.zone(FIEND, 'graveyard', { seat: 1 });
    g.expect.noObject(FIEND, { zone: 'exile' });
    g.expect.stack([]);
  });

  test('it can be taken back while paying: the question comes back, and then the card can still be declined', () => {
    const g = rot((b) => swamps(b.hand(FIEND)));
    resolveTop(g);
    g.act(1).accept();
    g.act(1).cancel();
    g.expect.pending('confirmOptional', 1);
    g.expect.zone(FIEND, 'exile', { seat: 1 });
    g.act(1).decline();
    g.expect.zone(FIEND, 'graveyard', { seat: 1 });
  });

  test('without the mana for the madness cost nothing is asked: the card goes to the graveyard', () => {
    const g = rot((b) => b.battlefield('Swamp').hand(FIEND));
    resolveTop(g);
    g.expect.zone(FIEND, 'graveyard', { seat: 1 });
    g.expect.pending('priority', 0);
  });

  test('a spell with a target and none to choose: it cannot be cast, so it goes to the graveyard', () => {
    const g = rot((b) => b.battlefield('Mountain').hand(BOLT));
    resolveTop(g);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
  });

  test('a spell with a target and a legal one: the targets are chosen as it is cast (CR 601.2c)', () => {
    const g = rot((b) =>
      b.battlefield('Mountain').hand(BOLT).seat(0).battlefield('Grizzly Bears').seat(1),
    );
    resolveTop(g);
    g.act(1).accept();
    g.act(1).chooseTargets('Grizzly Bears');
    g.act(1).payAuto();
    g.expect.stack([BOLT]);
    resolveTop(g);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
  });

  test('two cards discarded together: two triggers, each asked in turn, ordered by their owner (CR 603.3b)', () => {
    const g = rot((b) => swamps(b.hand(FIEND, CYCLER), 3), ROT);
    g.expect.pending('orderTriggers', 1);
    g.act(1).orderTriggers(0, 1);
    expect(g.state.stack).toHaveLength(2);
    resolveTop(g);
    g.act(1).decline();
    g.expect.stack([`${FIEND} (ability)`]);
  });

  test('the exiled card is a new object: the hand object is gone (CR 400.7)', () => {
    const before = scenario()
      .seat(0)
      .hand(NIBBLE)
      .battlefield('Swamp')
      .library(...FILLER)
      .seat(1)
      .hand(FIEND)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    const handId = before.find({ name: FIEND, zone: 'hand' })[0]?.id;
    before.act(0).cast(NIBBLE, { pay: true });
    resolveTop(before);
    expect(handId === undefined || before.state.objects[handId] === undefined).toBe(true);
    before.expect.zone(FIEND, 'exile', { seat: 1 });
  });
});

describe('every kind of discard (CR 701.9)', () => {
  test('a discard paid as the additional cost of a spell: the card is exiled, the trigger goes on the stack above it', () => {
    const g = scenario()
      .seat(0)
      .hand(RUMMAGE, FIEND)
      .battlefield('Mountain')
      .battlefield('Swamp', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(RUMMAGE, { pay: true });
    // The only other card in the hand is the discard: it is chosen without a question.
    g.expect.zone(FIEND, 'exile', { seat: 0 });
    g.expect.stack([`${FIEND} (ability)`, RUMMAGE]);
    resolveTop(g);
    g.act(0).accept();
    g.act(0).payAuto();
    g.expect.stack([FIEND, RUMMAGE]);
  });

  test('the discard of the cleanup step (CR 514.1)', () => {
    const g = scenario()
      .seat(0)
      .hand(FIEND, 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield('Swamp', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('postcombatMain', { active: 0, turn: 3 })
      .build();
    g.advanceTo('end');
    g.passAll();
    g.expect.pending('discard', 0);
    g.act(0).chooseCards(FIEND);
    g.expect.zone(FIEND, 'exile', { seat: 0 });
    g.expect.stack([`${FIEND} (ability)`]);
  });

  test('Cycling discards the card as its cost: it is exiled, and the cycling draw still happens', () => {
    const g = scenario()
      .seat(0)
      .hand(CYCLER)
      .battlefield('Swamp', { count: 3 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).activate(CYCLER, { pay: true });
    g.expect.zone(CYCLER, 'exile', { seat: 0 });
    g.expect.stack([`${CYCLER} (ability)`, `${CYCLER} (ability)`]);
    g.passAll();
  });
});

describe('a commander with madness (CR 903.9a)', () => {
  test('it is in exile when discarded: its owner may put it into the command zone, and then there is nothing to cast', () => {
    const g = rot((b) => swamps(b.hand(COMMANDER, { commander: true, label: 'cmd' })));
    g.expect.pending('commanderZone', 1);
    g.act(1).sendToCommandZone();
    g.expect.zone(COMMANDER, 'command', { seat: 1 });
    g.passAll();
    g.expect.noEvent({ kind: 'spellCast', fromZone: 'exile' });
  });

  test('declining the question keeps it in exile; its madness cast pays no commander tax', () => {
    const g = rot((b) => swamps(b.hand(COMMANDER, { commander: true, label: 'cmd' })));
    g.act(1).declineCommandZone();
    resolveTop(g);
    g.act(1).accept();
    g.act(1).payAuto();
    g.expect.eventLog([
      { kind: 'spellCast', fromZone: 'exile', commanderTax: 0, alternative: 'madness' },
    ]);
    resolveTop(g);
    g.expect.zone(COMMANDER, 'battlefield', { seat: 1 });
  });
});

describe('determinism and the state hash', () => {
  test('the same plays give the same hash', () => {
    const run = () => {
      const g = rot((b) => swamps(b.hand(FIEND)));
      return g;
    };
    expect(stateHash(run().state)).toBe(stateHash(run().state));
  });
});

describe('validation and support', () => {
  const withMadness = (alt: unknown, types: readonly string[] = ['creature']) => {
    const base = syntheticCard(FIEND);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    return { ...base, faces: [{ ...face, types, alternativeCosts: [alt] }] } as never;
  };

  test('the real shapes are valid and the feature is supported', () => {
    for (const name of [FIEND, BOLT, CYCLER, COMMANDER, ROT, NIBBLE, RUMMAGE]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
    expect(isFeatureSupported('castAlternative:madness')).toBe(true);
  });

  test.each([
    [
      'X in the cost',
      { kind: 'madness', cost: [{ kind: 'mana', symbols: ['X'] }] },
      'X in an alternative cost',
    ],
    [
      'a cost that is not mana',
      { kind: 'madness', cost: [{ kind: 'payLife', amount: 2 }] },
      'mana only',
    ],
    [
      'an exile count',
      { kind: 'madness', cost: [{ kind: 'mana', symbols: ['B'] }], exile: 2 },
      'only escape exiles',
    ],
  ])('%s is refused with a reason', (_name, alt, reason) => {
    expect(JSON.stringify(validateCard(withMadness(alt)))).toContain(reason);
  });

  test('a land cannot have madness', () => {
    const alt = { kind: 'madness', cost: [{ kind: 'mana', symbols: ['B'] }] };
    expect(JSON.stringify(validateCard(withMadness(alt, ['land'])))).toContain('not on a land');
  });

  test('a madness cast from the hand is never accepted', () => {
    const g = rot((b) => swamps(b.hand(FIEND, 'Grizzly Bears')));
    const card = g.find({ name: FIEND, zone: 'hand' })[0];
    if (card === undefined) throw new Error('no card');
    g.act(1).chooseCards('Grizzly Bears');
    resolveTop(g);
    expect(
      applyAction(g.state, 1, { kind: 'castSpell', object: card.id, alternative: 'madness' }).ok,
    ).toBe(false);
  });
});
