// "[Do something] unless [that player] pays [cost]" (D-111): the `unlessPays` effect, and a spell cast
// by an opponent as a trigger event (`castSpell` with `by: 'opponent'`).
// Pins: CR 118.12a ("[do something] unless [a player does something else]" means "[a player may do
// something else]. If [that player] doesn't, [do something]": the payer chooses first, then the
// effect, with "you may" asked of the controller after), CR 603.5 (the "unless" part is dealt with when
// the ability resolves), CR 118.3 (a cost that cannot be paid is not paid: nobody is asked), CR 119.4
// (paying life), CR 701.9 (discarding), CR 608.2h (the spell's controller from last-known information
// once the spell has left the stack), CR 601.2i (a spell is cast).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-triggers-more.ts) or fixtures.
import { describe, expect, test } from 'vitest';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const TAX = 'SYNTHETIC Tax Collector';
const STRICT = 'SYNTHETIC Strict Tax Collector';
const BLOOD = 'SYNTHETIC Blood Tax Collector';
const TITHE = 'SYNTHETIC Tithe Collector';
const TOLL = 'SYNTHETIC Toll Keeper';
const RIVAL = 'SYNTHETIC Rival Spell Watcher';
const BOLT = 'Lightning Bolt';

/**
 * Seat 1 is the active player and casts Lightning Bolt at seat 0 with `lands` Mountains of its own
 * (one is tapped for the Bolt); seat 0 controls `watchers`, has `library` cards and a hand of `hand`.
 */
function board(watchers: readonly string[], lands: number, hand: readonly string[] = []) {
  const g = scenario()
    .seat(0)
    .life(20)
    .battlefield(...watchers)
    .hand(...hand)
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .seat(1)
    .life(20)
    .hand(BOLT, 'Grizzly Bears')
    .battlefield(...Array.from({ length: lands }, () => 'Mountain'))
    .library('Plains', 'Plains', 'Plains', 'Plains')
    .at('precombatMain', { active: 1 })
    .build();
  g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
  return g;
}

/** Both players pass: the top of the stack, the tax trigger, resolves and asks its question. */
function resolveTrigger(g: ScenarioGame): void {
  g.pass();
  g.pass();
}

describe('an opponent casts a spell (CR 601.2i)', () => {
  test("the trigger goes on the stack above the spell, controlled by the watcher's controller", () => {
    const g = board([STRICT], 2);
    g.expect.stack([`${STRICT} (ability)`, BOLT]);
    g.expect.eventLog([
      { kind: 'spellCast', seat: 1 },
      { kind: 'abilityTriggered', seat: 0 },
    ]);
  });

  test('your own spell does not trigger "an opponent casts"', () => {
    const g = scenario()
      .seat(0)
      .battlefield(RIVAL, 'Mountain')
      .hand(BOLT)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.expect.stack([BOLT]);
  });

  test("the opponent's spell triggers the plain watcher", () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(RIVAL)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.expect.stack([`${RIVAL} (ability)`, BOLT]);
  });
});

describe('the payer pays {1} (CR 118.12a)', () => {
  test('is asked first, not the controller: a confirmOptional of purpose unlessPays for seat 1', () => {
    const g = board([TAX], 2);
    resolveTrigger(g);
    g.expect.pending('confirmOptional', 1);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(d.purpose).toBe('unlessPays');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['1'] }]);
    expect(d.sourceName).toBe(TAX);
    expect(d.subject).toBeUndefined();
    // Only the payer can answer.
    expect(g.legalActions(0)).toEqual([]);
    expect(g.legalActions(1).map((a) => a.kind)).toEqual(
      expect.arrayContaining(['acceptOptional', 'declineOptional']),
    );
  });

  test('accepting asks for the mana (payMana, purpose unlessPays) and paying ends it: no draw', () => {
    const g = board([TAX], 2);
    resolveTrigger(g);
    g.act(1).accept();
    g.expect.pending('payMana', 1);
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error('expected payMana');
    expect(d.purpose).toBe('unlessPays');
    expect(d.totalCost).toEqual(['1']);
    g.act(1).payAuto();
    g.expect.tapped('Mountain[0]', true);
    g.expect.tapped('Mountain[1]', true);
    g.expect.handSize(0, 0);
    g.expect.stack([BOLT]);
    g.expect.noEvent({ kind: 'cardDrawn' });
    g.expect.invariants();
  });

  test('backing out of the payment (cancel) is not paying: the effect happens', () => {
    const g = board([STRICT], 2);
    resolveTrigger(g);
    g.act(1).accept();
    g.act(1).cancel();
    g.expect.handSize(0, 1);
  });
});

/** "...you may draw a card unless that player pays {1}. Then you gain 3 life." (the draw is not the whole ability) */
const TAX_THEN_GAIN = singleFaceCard({
  name: 'SYNTHETIC Tax Then Gain',
  manaCost: ['2', 'U'],
  types: ['enchantment'],
  colors: ['U'],
  colorIdentity: ['U'],
  oracleText:
    'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}. Then you gain 3 life.',
  abilities: [
    {
      kind: 'triggered',
      trigger: { kind: 'castSpell', filter: { stackKind: 'spell' }, by: 'opponent' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'unlessPays',
            player: { kind: 'controllerOf', of: { kind: 'triggerSubject' } },
            cost: [{ kind: 'mana', symbols: ['1'] }],
            effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
            optional: true,
          },
          { kind: 'gainLife', player: { kind: 'you' }, amount: 3 },
        ],
      },
    },
  ],
});

describe('"you may" inside the effect only drops that effect', () => {
  const build = () => {
    const g = scenario()
      .define(TAX_THEN_GAIN)
      .seat(0)
      .life(20)
      .battlefield('SYNTHETIC Tax Then Gain')
      .library('Plains', 'Plains')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    resolveTrigger(g);
    return g;
  };

  test('declining to draw still lets the rest of the ability happen', () => {
    const g = build();
    g.act(1).decline();
    g.act(0).decline();
    g.expect.handSize(0, 0);
    g.expect.life(0, 23);
  });

  test('accepting draws and the rest happens too; a paid cost still gains the life', () => {
    const g = build();
    g.act(1).decline();
    g.act(0).accept();
    g.expect.handSize(0, 1);
    g.expect.life(0, 23);
    const paid = build();
    paid.act(1).accept();
    paid.act(1).payAuto();
    paid.expect.handSize(0, 0);
    paid.expect.life(0, 23);
  });
});

describe('the payer declines, or cannot pay', () => {
  test('declining lets the effect happen, and the controller is then asked "you may draw"', () => {
    const g = board([TAX], 2);
    resolveTrigger(g);
    g.act(1).decline();
    g.expect.pending('confirmOptional', 0);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('expected confirmOptional');
    expect(d.purpose).toBeUndefined();
    g.act(0).accept();
    g.expect.handSize(0, 1);
    g.expect.stack([BOLT]);
  });

  test('the controller may decline to draw', () => {
    const g = board([TAX], 2);
    resolveTrigger(g);
    g.act(1).decline();
    g.act(0).decline();
    g.expect.handSize(0, 0);
    g.expect.stack([BOLT]);
  });

  test('a payer who cannot pay is not asked: the effect happens at once', () => {
    // One Mountain, tapped for the Bolt: no mana for {1}.
    const g = board([TAX], 1);
    resolveTrigger(g);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.handSize(0, 1);
  });

  test('without "you may" the effect happens with no question to the controller', () => {
    const g = board([STRICT], 1);
    resolveTrigger(g);
    g.expect.pending('priority');
    g.expect.handSize(0, 1);
    g.expect.stack([BOLT]);
  });

  test('declining a strict one draws at once', () => {
    const g = board([STRICT], 2);
    resolveTrigger(g);
    g.act(1).decline();
    g.expect.pending('priority');
    g.expect.handSize(0, 1);
  });
});

describe('other costs: life and discarding', () => {
  test('pay 2 life: accepting loses the life and nothing happens', () => {
    const g = board([BLOOD], 1);
    resolveTrigger(g);
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.life(1, 18);
    g.expect.handSize(0, 0);
    g.expect.noEvent({ kind: 'cardDrawn' });
  });

  test('a payer with too little life is not asked', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(BLOOD)
      .library('Plains', 'Plains')
      .seat(1)
      .life(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    resolveTrigger(g);
    g.expect.handSize(0, 1);
  });

  test('discard a card: the payer chooses the card, and the effect does not happen', () => {
    const g = board([TITHE], 1, []);
    resolveTrigger(g);
    // Seat 1 holds one card (Grizzly Bears): it can pay.
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    // With exactly one card in hand it is discarded without a choice (CR 701.9).
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
    g.expect.handSize(0, 0);
  });

  test('discard a card with no card in hand: cannot pay, so the effect happens', () => {
    const g = scenario()
      .seat(0)
      .battlefield(TITHE)
      .library('Plains', 'Plains')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    resolveTrigger(g);
    g.expect.handSize(0, 1);
  });
});

describe('the spell is gone before the trigger resolves (CR 608.2h)', () => {
  test('the payer is still the caster of the countered spell, from last-known information', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(STRICT, 'Island', 'Island')
      .hand('Counterspell')
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .hand(BOLT)
      .battlefield('Mountain', 'Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.pass(); // seat 1 passes with the trigger on the stack
    g.act(0).cast('Counterspell', { targets: [BOLT], pay: true });
    // Counterspell resolves first and counters the Bolt; then the trigger resolves.
    g.pass();
    g.pass();
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.stack([`${STRICT} (ability)`]);
    g.pass();
    g.pass();
    // Seat 1 (the caster of the Bolt that was countered) is asked whether to pay {1}.
    g.expect.pending('confirmOptional', 1);
    g.act(1).decline();
    g.expect.handSize(0, 1);
  });
});

describe('a step trigger with a payer who is not its controller', () => {
  test('"each opponent loses 2 life unless they pay {2}" asked of the opponent at its upkeep', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(TOLL)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Mountain', 'Mountain')
      .library('Plains', 'Plains')
      .at('endOfCombat', { active: 0, turn: 3 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([`${TOLL} (ability)`]);
    g.pass();
    g.pass();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.act(1).payAuto();
    g.expect.life(1, 20);
    g.expect.tapped('Mountain[0]', true);
  });

  test('declining loses the life', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(TOLL)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .battlefield('Mountain', 'Mountain')
      .library('Plains', 'Plains')
      .at('endOfCombat', { active: 0, turn: 3 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.pass();
    g.pass();
    g.act(1).decline();
    g.expect.life(1, 18);
  });

  test('with no mana the opponent loses the life without a question', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .battlefield(TOLL)
      .library('Plains', 'Plains')
      .seat(1)
      .life(20)
      .library('Plains', 'Plains')
      .at('endOfCombat', { active: 0, turn: 3 })
      .build();
    g.advanceTo('upkeep', { turn: 'next' });
    g.pass();
    g.pass();
    g.expect.life(1, 18);
  });
});

describe('determinism and legal actions', () => {
  test('the same game twice gives the same hash', () => {
    const run = () => {
      const g = board([TAX], 2);
      resolveTrigger(g);
      g.act(1).decline();
      g.act(0).accept();
      return g.hash();
    };
    expect(run()).toBe(run());
  });

  test('every legal action at each of the questions is accepted by the engine', () => {
    const builds: readonly (() => ScenarioGame)[] = [
      () => {
        const g = board([TAX], 2);
        resolveTrigger(g);
        return g;
      },
      () => {
        const g = board([TAX], 2);
        resolveTrigger(g);
        g.act(1).accept();
        return g;
      },
      () => {
        const g = board([TAX], 2);
        resolveTrigger(g);
        g.act(1).decline();
        return g;
      },
    ];
    for (const build of builds) {
      const seat = build().deciding;
      for (const action of build().legalActions(seat)) {
        expect(build().act(seat).try.action(action).ok, JSON.stringify(action)).toBe(true);
      }
    }
  });
});
