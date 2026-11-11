// "If you control a commander, you may cast this spell without paying its mana cost" (D-095).
// Pins: CR 118.9 (an alternative cost, usually "You may cast [this object] without paying its mana
// cost"), CR 118.9a / 601.2b (the player announces it as the spell is cast; only one alternative cost
// applies), CR 118.9c (it doesn't change the mana cost), CR 118.9d (any additional costs, cost
// increases and cost reductions that affect the spell are applied to the alternative cost),
// CR 903.3d ("controlling a commander" is a permanent on the battlefield that is a commander),
// CR 903.3 (a token, or a permanent copying a commander, is not one), CR 903.8 (commander tax is an
// additional cost: it is paid with a free cast from the command zone), CR 601.2h (additional costs
// are paid). Cards are SYNTHETIC (src/cards/fixtures/synthetic-costs.ts).
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, getView } from '../src/index';
import { scenario } from '../src/testing/index';

const COUNTER = 'SYNTHETIC Free Counter'; // {2}{U}, free with a commander
const EXILE = 'SYNTHETIC Free Exile'; // {3}{B}, free with a commander
const OFFERING = 'SYNTHETIC Free Offering'; // {4}{B}, sacrifice a creature, free with a commander
const ALWAYS = 'SYNTHETIC Always Free'; // {5}, free without a condition
const COLOSSUS = 'SYNTHETIC Free Colossus'; // {5}{G}{G} creature, free with a commander
const BOLT = 'Lightning Bolt';

const freeOptions = (g: ReturnType<ReturnType<typeof scenario>['build']>, seat = 0) =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'castSpell' && a.alternative === 'free');

describe('the condition: you control a commander (CR 903.3d)', () => {
  const exile = (setup: (b: ReturnType<typeof scenario>) => void) => {
    const b = scenario().seat(0).hand(EXILE);
    setup(b);
    return b.seat(1).battlefield('Giant Spider').build();
  };

  test('a commander you control on the battlefield: the free cast is offered', () => {
    const g = exile((b) => b.battlefield('Grizzly Bears', { commander: true }));
    g.expect.legal(0, { cast: EXILE, alternative: 'free' });
    expect(freeOptions(g)).toHaveLength(1);
  });

  test('no commander at all: not offered, and the engine refuses it', () => {
    const g = exile((b) => b.battlefield('Grizzly Bears'));
    g.expect.illegal(0, { cast: EXILE, alternative: 'free' });
    expect(freeOptions(g)).toEqual([]);
  });

  test('a commander still in the command zone is not "controlled" (CR 903.3d)', () => {
    const g = exile((b) => b.commander('Isamaru, Hound of Konda'));
    g.expect.illegal(0, { cast: EXILE, alternative: 'free' });
  });

  test('a commander in the graveyard or the hand is not controlled either', () => {
    const g = exile((b) =>
      b.graveyard('Grizzly Bears', { commander: true }).hand('Giant Spider', { commander: true }),
    );
    g.expect.illegal(0, { cast: EXILE, alternative: 'free' });
  });

  test('an opponent’s commander does not count unless you control it', () => {
    const theirs = scenario()
      .seat(0)
      .hand(EXILE)
      .seat(1)
      .battlefield('Grizzly Bears', { commander: true })
      .battlefield('Giant Spider')
      .build();
    theirs.expect.illegal(0, { cast: EXILE, alternative: 'free' });
    // Stolen: seat 1 owns it, seat 0 controls it.
    const stolen = scenario()
      .seat(0)
      .hand(EXILE)
      .seat(1)
      .battlefield('Grizzly Bears', { commander: true, controller: 0 })
      .battlefield('Giant Spider')
      .build();
    stolen.expect.legal(0, { cast: EXILE, alternative: 'free' });
  });

  test('the condition is read for whoever casts it: the opponent of the commander’s controller', () => {
    const g = scenario()
      .seat(0)
      .battlefield('Grizzly Bears', { commander: true })
      .seat(1)
      .hand(EXILE)
      .battlefield('Giant Spider')
      .at('precombatMain', { active: 1 })
      .build();
    g.expect.illegal(1, { cast: EXILE, alternative: 'free' });
  });

  test('a card without the alternative cost has no free option', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Grizzly Bears', { commander: true })
      .seat(1)
      .build();
    g.expect.illegal(0, { cast: BOLT, alternative: 'free' });
  });

  test('an alternative cost with no condition is always on offer', () => {
    const g = scenario().seat(0).hand(ALWAYS).seat(1).build();
    g.expect.legal(0, { cast: ALWAYS, alternative: 'free' });
    g.expect.illegal(0, { cast: ALWAYS });
  });
});

describe('casting it without paying', () => {
  test('no mana is asked or spent; the event and the view say it was free', () => {
    const g = scenario()
      .seat(0)
      .hand(EXILE)
      .battlefield('Grizzly Bears', { commander: true })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    const cast = g.act(0).cast(EXILE, { alternative: 'free' });
    g.expect.pending('targets', 0);
    cast.targets(['Giant Spider']);
    g.expect.stack([EXILE]);
    g.expect.pending('priority', 0);
    g.expect.pool(0, '');
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'free', commanderTax: 0 }]);
    expect(getView(g.state, 1).stack[0]?.free).toBe(true);
    g.passAll();
    g.expect.zone('Giant Spider', 'exile');
    g.expect.invariants();
  });

  test('the ordinary cast is a separate option, with its own cost', () => {
    const g = scenario()
      .seat(0)
      .hand(EXILE)
      .battlefield('Grizzly Bears', { commander: true })
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.expect.legal(0, { cast: EXILE });
    g.expect.legal(0, { cast: EXILE, alternative: 'free' });
    g.act(0).cast(EXILE, { targets: ['Giant Spider'], pay: true });
    expect(g.find({ name: 'Swamp', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(4);
    g.expect.eventLog([{ kind: 'spellCast' }]);
    g.expect.noEvent({ kind: 'spellCast', alternative: 'free' });
  });

  test('with no lands at all only the free option exists', () => {
    const g = scenario()
      .seat(0)
      .hand(EXILE)
      .battlefield('Grizzly Bears', { commander: true })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.expect.illegal(0, { cast: EXILE });
    g.expect.legal(0, { cast: EXILE, alternative: 'free' });
  });

  test('cancelling a free cast restores everything (CR 733)', () => {
    const g = scenario()
      .seat(0)
      .hand(EXILE)
      .battlefield('Grizzly Bears', { commander: true })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    const before = g.positionHash();
    g.act(0).cast(EXILE, { alternative: 'free' }).cancel();
    g.expect.position(before);
  });

  test('a free counterspell answers an opponent’s spell with no mana', () => {
    const g = scenario()
      .seat(0)
      .hand(COUNTER)
      .battlefield('Grizzly Bears', { commander: true })
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.pass(1);
    g.expect.legal(0, { cast: COUNTER, alternative: 'free' });
    g.act(0).cast(COUNTER, { alternative: 'free', targets: [BOLT] });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
  });

  test('a creature spell cast for free enters the battlefield', () => {
    const g = scenario()
      .seat(0)
      .hand(COLOSSUS)
      .battlefield('Grizzly Bears', { commander: true })
      .seat(1)
      .build();
    g.act(0).cast(COLOSSUS, { alternative: 'free' });
    g.passAll();
    g.expect.zone(COLOSSUS, 'battlefield', { seat: 0 });
  });
});

describe('additional costs and commander tax still apply (CR 118.9d, 903.8)', () => {
  test('a sacrifice cost is still paid with a free cast', () => {
    const g = scenario()
      .seat(0)
      .hand(OFFERING)
      .battlefield('Grizzly Bears', { commander: true })
      .battlefield('Llanowar Elves')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(OFFERING, { alternative: 'free' });
    expect(permanentChoiceLegal(g)).toHaveLength(2);
    g.act(0).choosePermanents('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.handSize(0, 3);
  });

  test('with nothing to sacrifice the free cast is not offered', () => {
    // The commander is a land (the flag is a designation of the card): no creature to sacrifice.
    const g = scenario()
      .seat(0)
      .hand(OFFERING)
      .battlefield('Mountain', { commander: true })
      .seat(1)
      .build();
    g.expect.illegal(0, { cast: OFFERING, alternative: 'free' });
    expect(freeOptions(g)).toEqual([]);
  });

  test('a commander that is the only creature may be the one sacrificed: the engine chooses it', () => {
    const g = scenario()
      .seat(0)
      .hand(OFFERING)
      .battlefield('Grizzly Bears', { commander: true })
      .seat(1)
      .build();
    g.expect.legal(0, { cast: OFFERING, alternative: 'free' });
    g.act(0).cast(OFFERING, { alternative: 'free' });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });

  test('commander tax is paid with a free cast from the command zone', () => {
    const none = scenario()
      .seat(0)
      .commander(COLOSSUS, { casts: 2, label: 'cmd' })
      .battlefield('Grizzly Bears', { commander: true })
      .battlefield('Forest', { count: 3 })
      .seat(1)
      .build();
    // Two earlier casts: {2}{2} extra even though the mana cost is not paid; three lands are short.
    expect(getView(none.state, 0).seats[0]?.command[0]?.castCost).toEqual([
      '5',
      'G',
      'G',
      '2',
      '2',
    ]);
    none.expect.illegal(0, { cast: 'cmd', alternative: 'free' });
    const enough = scenario()
      .seat(0)
      .commander(COLOSSUS, { casts: 2, label: 'cmd' })
      .battlefield('Grizzly Bears', { commander: true })
      .battlefield('Forest', { count: 4 })
      .seat(1)
      .build();
    enough.expect.legal(0, { cast: 'cmd', alternative: 'free' });
    const cast = enough.act(0).cast('cmd', { alternative: 'free' });
    expect(enough.state.casting?.totalCost).toEqual(['2', '2']);
    cast.pay();
    enough.expect.eventLog([
      { kind: 'spellCast', fromZone: 'command', alternative: 'free', commanderTax: 4 },
    ]);
    const card = enough.object('cmd').card;
    if (card === null) throw new Error('no card');
    expect(enough.state.commanderCasts[card]).toBe(3);
  });

  test('a reduction applies to the tax of a free cast', () => {
    const g = scenario()
      .seat(0)
      .commander(COLOSSUS, { casts: 2, label: 'cmd' })
      .battlefield('Grizzly Bears', { commander: true })
      .battlefield('SYNTHETIC Giant Discount')
      .battlefield('Forest', { count: 2 })
      .seat(1)
      .build();
    // {2}{2} tax less {2} is {2}.
    g.expect.legal(0, { cast: 'cmd', alternative: 'free' });
    g.act(0).cast('cmd', { alternative: 'free' });
    expect(g.state.casting?.totalCost).toEqual(['2']);
  });
});

describe('the engine and the legal actions agree', () => {
  test('every offered free cast is accepted and every other is refused', () => {
    for (const hasCommander of [true, false]) {
      const b = scenario().seat(0).hand(EXILE, COUNTER, ALWAYS, OFFERING);
      if (hasCommander) b.battlefield('Grizzly Bears', { commander: true });
      const g = b.seat(1).battlefield('Giant Spider').build();
      const offered = new Set(freeOptions(g).map((a) => (a.kind === 'castSpell' ? a.object : '')));
      for (const name of [EXILE, COUNTER, ALWAYS, OFFERING]) {
        const object = g.id(name);
        const result = applyAction(g.state, 0, {
          kind: 'castSpell',
          object,
          alternative: 'free',
        });
        expect(result.ok, `${name} (commander ${hasCommander})`).toBe(offered.has(object));
      }
    }
  });
});

function permanentChoiceLegal(g: ReturnType<ReturnType<typeof scenario>['build']>) {
  const d = g.state.pending;
  if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
  return d.legal;
}
