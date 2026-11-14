// Scenario 22 (SPEC 12): commander tax.
// Pins: CR 903.8 (Commander): a commander cast from the command zone costs an additional {2} for
// each previous time its owner cast it from the command zone that game; casting it from anywhere
// else adds nothing; the count belongs to the commander card, not to the object (CR 400.7).
// CR 601.2f (Casting Spells): the total cost includes the tax. Isamaru costs {W}, so the exact
// number of Plains needed is 1, 3, 5 for the first, second and third cast.
import { describe, expect, test } from 'vitest';
import { getView } from '../src/index';
import { scenario } from '../src/testing/index';

const ISAMARU = 'Isamaru, Hound of Konda';
const YARGLE = 'Yargle, Glutton of Urborg';

/** Isamaru in the command zone, cast before `casts` times, with `plains` untapped Plains. */
function withPlains(casts: number, plains: number) {
  const b = scenario().seat(0).commander(ISAMARU, { casts, label: 'cmd' });
  if (plains > 0) b.battlefield('Plains', { count: plains });
  return b.seat(1).build();
}

describe('CR 903.8 (Commander): the tax grows by {2} per cast from the command zone', () => {
  test.each([
    [0, 1],
    [1, 3],
    [2, 5],
    [3, 7],
  ])('after %i earlier casts it takes exactly %i Plains', (casts, needed) => {
    const short = withPlains(casts, needed - 1);
    short.expect.illegal(0, { cast: 'cmd' });
    const exact = withPlains(casts, needed);
    exact.expect.legal(0, { cast: 'cmd' });
    exact.act(0).cast('cmd', { pay: true });
    for (let i = 0; i < needed; i += 1) exact.expect.tapped(`Plains[${i}]`);
    exact.expect.pool(0, '');
    exact.expect.stack([ISAMARU]);
  });

  test('payment fails with one land short, at the payment step too', () => {
    const g = withPlains(1, 3);
    const cast = g.act(0).cast('cmd');
    expect(g.state.casting?.totalCost).toEqual(['W', '2']);
    // Two Plains tapped by hand do not pay {W}{2}: the engine rejects it and the cast carries on.
    const short = g.act(0).try.action({
      kind: 'payManual',
      taps: [0, 1].map((n) => ({ object: g.id(`Plains[${n}]`), abilityIndex: 0 })),
    });
    expect(short).toEqual({ ok: false, error: 'The mana you tapped does not pay that cost' });
    g.expect.pending('payMana', 0);
    g.expect.tapped('Plains[0]', false);
    cast.payManual(['Plains[0]', 'Plains[1]', 'Plains[2]']);
    g.expect.stack([ISAMARU]);
  });

  test('the tax is in the event of the cast: {2} per previous cast', () => {
    const g = withPlains(2, 5);
    g.act(0).cast('cmd', { pay: true });
    g.expect.eventLog([{ kind: 'spellCast', fromZone: 'command', commanderTax: 4 }]);
  });

  test('the count goes up when the cast completes, not before and not on cancel', () => {
    const g = withPlains(0, 3);
    const card = g.object('cmd').card;
    if (card === null) throw new Error('no card');
    const before = g.positionHash();
    g.act(0).cast('cmd').cancel();
    g.expect.position(before);
    expect(g.state.commanderCasts[card] ?? 0).toBe(0);
    g.act(0).cast('cmd');
    expect(g.state.commanderCasts[card] ?? 0).toBe(0);
    g.act(0).payAuto();
    expect(g.state.commanderCasts[card]).toBe(1);
  });

  test('a full round: cast, die, return, and the second cast costs 3', () => {
    const g = scenario()
      .seat(0)
      .commander(ISAMARU, { label: 'cmd' })
      .battlefield('Plains', { count: 4 })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .build();
    g.act(0).cast('cmd', { pay: true });
    g.passAll();
    g.expect.zone(ISAMARU, 'battlefield', { seat: 0 });
    g.act(0).pass();
    g.act(1).cast('Murder', { targets: [{ name: ISAMARU }], pay: true });
    g.passAll();
    g.act(0).sendToCommandZone();
    // One Plains was spent on the first cast; three are untapped: {W}{2} is just payable.
    g.expect.legal(0, { cast: 'cmd' });
    g.act(0).cast('cmd', { pay: true });
    g.expect.eventLog([{ kind: 'spellCast', fromZone: 'command', commanderTax: 2 }]);
    for (let i = 0; i < 4; i += 1) g.expect.tapped(`Plains[${i}]`);
  });
});

describe('CR 903.8 (Commander): casting from anywhere else adds no tax', () => {
  test('a commander in the hand costs its plain cost, however often it was cast before', () => {
    const g = scenario()
      .seat(0)
      .hand(ISAMARU, { commander: true, casts: 2, label: 'cmd' })
      .battlefield('Plains')
      .seat(1)
      .build();
    g.expect.legal(0, { cast: 'cmd' });
    g.act(0).cast('cmd', { pay: true });
    g.expect.eventLog([{ kind: 'spellCast', fromZone: 'hand', commanderTax: 0 }]);
    // Casting from hand does not count as a command-zone cast (CR 903.8): the count stays.
    const card = g.object('cmd').card;
    expect(card && g.state.commanderCasts[card]).toBe(2);
  });

  test('a non-commander card never pays tax', () => {
    const g = scenario().seat(0).hand('Grizzly Bears').battlefield('Forest', { count: 2 }).build();
    g.act(0).cast('Grizzly Bears', { pay: true });
    g.expect.eventLog([{ kind: 'spellCast', fromZone: 'hand', commanderTax: 0 }]);
  });
});

describe('CR 903.8 (Commander): the tax is tracked per commander card', () => {
  function twoCommanders() {
    return scenario()
      .seat(0)
      .commander(ISAMARU, { casts: 2, label: 'isamaru' })
      .commander(YARGLE, { casts: 0, label: 'yargle' })
      .battlefield('Plains', { count: 4 })
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .build();
  }

  test("one commander's casts do not tax the other", () => {
    const g = twoCommanders();
    // Yargle costs {3}{B} = 4 mana; it has never been cast, so no tax, whatever Isamaru's count is.
    g.act(0).cast('yargle', { pay: true });
    g.expect.eventLog([{ kind: 'spellCast', cardName: YARGLE, commanderTax: 0 }]);
    const card = g.object('yargle').card;
    const isamaru = g.object('isamaru').card;
    expect(card && g.state.commanderCasts[card]).toBe(1);
    expect(isamaru && g.state.commanderCasts[isamaru]).toBe(2);
  });

  test('the view shows each commander its own tax', () => {
    const g = twoCommanders();
    const a = g.object('isamaru').card;
    const b = g.object('yargle').card;
    if (a === null || b === null) throw new Error('no card');
    expect(getView(g.state, 0).seats[0]?.commanderTax).toEqual({ [a]: 4, [b]: 0 });
  });

  test('the second commander with its own count pays its own tax', () => {
    const g = scenario()
      .seat(0)
      .commander(ISAMARU, { casts: 0, label: 'isamaru' })
      .commander(YARGLE, { casts: 1, label: 'yargle' })
      .battlefield('Swamp', { count: 5 })
      .build();
    // Yargle {3}{B} plus {2} = 6 mana: five Swamps are one short.
    g.expect.illegal(0, { cast: 'yargle' });
    const h = scenario()
      .seat(0)
      .commander(YARGLE, { casts: 1, label: 'yargle' })
      .battlefield('Swamp', { count: 6 })
      .build();
    h.expect.legal(0, { cast: 'yargle' });
  });

  test('the tax stays with the card across zone changes (card, not object, CR 400.7)', () => {
    const g = scenario()
      .seat(0)
      .battlefield(ISAMARU, { commander: true, casts: 1, label: 'cmd' })
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island')
      .at('precombatMain', { active: 0, priority: 1 })
      .build();
    g.act(1).cast('Unsummon', { targets: [{ name: ISAMARU }], pay: true });
    g.passAll();
    g.act(0).sendToCommandZone();
    const card = g.object('cmd').card;
    expect(card && g.state.commanderCasts[card]).toBe(1);
  });
});
