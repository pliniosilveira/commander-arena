// Parsed text is only worth something if the engine runs it as written (stage P24). These tests import SYNTHETIC cards
// through the grammar (never through a fixture), define them in an engine scenario and play them through applyAction:
// the four play rules of D-125 (ENGINE_VERSION 24): an additional land play (CR 305.2), looking at the top card of the
// library (CR 401.5, a view of the viewer only), the cost of attacking (CR 508.1d, 508.1h) and the optional untap
// (CR 502.3). Every card name starts with "SYNTHETIC"; the lines are the real ones of reports/templates.json ("You
// may play an additional land on each of your turns.", "You may look at the top card of your library any time.", the
// two attack-tax wordings, "You may choose not to untap ~ during your untap step."). No real card's text is claimed.
// The board uses the engine's own fixtures (Grizzly Bears, Giant Spider, the basic lands, a vanilla planeswalker).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';

describe('"You may play an additional land on each of your turns." (backlog: 17 cards; CR 305.2)', () => {
  const PATH = parsed(
    'SYNTHETIC Parsed Path',
    'Enchantment',
    'You may play an additional land on each of your turns.',
    { manaCost: '{2}{G}', colors: ['G'] },
  );
  const TWIN = parsed(
    'SYNTHETIC Parsed Twin Path',
    'Enchantment',
    'You may play two additional lands on each of your turns.',
    { manaCost: '{3}{G}', colors: ['G'] },
  );
  const SHARED = parsed(
    'SYNTHETIC Parsed Shared Path',
    'Enchantment',
    'Each player may play an additional land on each of their turns.',
    { manaCost: '{2}{G}', colors: ['G'] },
  );

  const main = (lands: number, configure: (b: ReturnType<typeof scenario>) => unknown) => {
    const b = scenario()
      .define(PATH)
      .define(TWIN)
      .define(SHARED)
      .seat(0)
      .hand('Forest', { count: lands });
    configure(b);
    return b.seat(1).at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('the lowering is the engine ability', () => {
    expect(PATH.faces[0]?.abilities).toEqual([
      { kind: 'static', static: { kind: 'additionalLandDrops', count: 1 } },
    ]);
    expect(TWIN.faces[0]?.abilities).toEqual([
      { kind: 'static', static: { kind: 'additionalLandDrops', count: 2 } },
    ]);
    expect(SHARED.faces[0]?.abilities).toEqual([
      { kind: 'static', static: { kind: 'additionalLandDrops', count: 1, eachPlayer: true } },
    ]);
  });

  test('without it the second land is refused (the baseline); with it two lands are played, not three', () => {
    const none = main(3, () => {});
    none.act(0).playLand('Forest[0]');
    none.expect.illegal(0, { playLand: 'Forest[0]' });
    const g = main(3, (b) => b.battlefield(PATH.name));
    expect(g.view(0).seats[0]?.landPlaysAllowed).toBe(2);
    g.act(0).playLand('Forest[0]').playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
    expect(g.state.seats[0]?.landsPlayedThisTurn).toBe(2);
  });

  test('"two additional lands" is three land plays in all', () => {
    const g = main(4, (b) => b.battlefield(TWIN.name));
    expect(g.view(0).seats[0]?.landPlaysAllowed).toBe(3);
    g.act(0).playLand('Forest[0]').playLand('Forest[0]').playLand('Forest[0]');
    g.expect.illegal(0, { playLand: 'Forest[0]' });
  });

  test('"Each player" gives the extra land to the opponent too, in its own turn', () => {
    const g = scenario()
      .define(SHARED)
      .seat(0)
      .battlefield(SHARED.name)
      .seat(1)
      .hand('Forest', { count: 3 })
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    g.act(1).playLand('Forest[0]').playLand('Forest[0]');
    g.expect.illegal(1, { playLand: 'Forest[0]' });
    // "You may play an additional land" of an opponent's permanent gives nothing.
    const mine = scenario()
      .define(PATH)
      .seat(0)
      .battlefield(PATH.name)
      .seat(1)
      .hand('Forest', { count: 3 })
      .at('precombatMain', { active: 1, turn: 4 })
      .build();
    mine.act(1).playLand('Forest[0]');
    mine.expect.illegal(1, { playLand: 'Forest[0]' });
  });
});

describe('"You may look at the top card of your library any time." (backlog: 44 cards; CR 401.5)', () => {
  const LENS = parsed(
    'SYNTHETIC Parsed Lens',
    'Enchantment',
    'You may look at the top card of your library any time.',
    { manaCost: '{1}{U}', colors: ['U'] },
  );

  const game = (withLens: boolean) => {
    const b = scenario().define(LENS).seat(0);
    if (withLens) b.battlefield(LENS.name);
    return b
      .library(BEARS, { label: 'a' })
      .library('Island', { label: 'b' })
      .seat(1)
      .library('Giant Spider', { label: 'x' })
      .library('Plains', { label: 'y' })
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
  };

  test('the lowering is the engine ability', () => {
    expect(LENS.faces[0]?.abilities).toEqual([
      { kind: 'static', static: { kind: 'lookAtTopOfLibrary' } },
    ]);
  });

  test('the controller sees the top card in their own view and nobody else sees it', () => {
    const g = game(true);
    expect(g.view(0).seats[0]?.libraryTop?.name).toBe(BEARS);
    expect(g.view(0).seats[1]?.libraryTop).toBeUndefined();
    const theirs = JSON.stringify(g.view(1));
    expect(g.view(1).seats[0]?.libraryTop).toBeUndefined();
    expect(theirs).not.toContain(g.id('a'));
    expect(theirs).not.toContain(BEARS);
  });

  test('without the permanent nobody sees a library card (the baseline)', () => {
    const g = game(false);
    expect(g.view(0).seats[0]?.libraryTop).toBeUndefined();
  });
});

describe('"Creatures can\'t attack you unless their controller pays {2} for each creature ..." (CR 508.1h)', () => {
  const GATE = parsed(
    'SYNTHETIC Parsed Gate',
    'Enchantment',
    "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.",
    { manaCost: '{2}{W}', colors: ['W'] },
  );
  const ANNEX = parsed(
    'SYNTHETIC Parsed Annex',
    'Artifact',
    "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures.",
    { manaCost: '{2}' },
  );

  const atAttackers = (taxer: string, seat0: (b: ReturnType<typeof scenario>) => unknown) => {
    const b = scenario().define(GATE).define(ANNEX).seat(0).library('Island', { count: 4 });
    seat0(b);
    b.seat(1).library('Island', { count: 4 }).battlefield(taxer, WALKER);
    const g = b.at('precombatMain', { active: 0 }).build();
    g.advanceTo('declareAttackers', { attack: false });
    return g;
  };

  const payment = (g: ReturnType<typeof atAttackers>) => {
    const d = g.state.pending;
    if (d?.kind !== 'payMana') throw new Error(`expected payMana, got ${d?.kind}`);
    return d;
  };

  test('the lowering is the engine ability', () => {
    expect(GATE.faces[0]?.abilities).toEqual([
      { kind: 'static', static: { kind: 'attackTax', cost: [{ kind: 'mana', symbols: ['2'] }] } },
    ]);
    expect(ANNEX.faces[0]?.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'attackTax',
          cost: [{ kind: 'mana', symbols: ['W/P'] }],
          planeswalkers: true,
        },
      },
    ]);
  });

  test('the tax is asked for and paid: nothing is declared until {2} is paid, then the attacker is declared', () => {
    const g = atAttackers(GATE.name, (b) =>
      b.battlefield(BEARS, 'Mountain', 'Mountain', 'Mountain'),
    );
    g.act(0).attack(BEARS);
    const d = payment(g);
    expect(d.purpose).toBe('attackTax');
    expect(d.totalCost).toEqual(['2']);
    expect(d.source).toBe(g.id(GATE.name));
    expect(g.state.combat).toBeNull();
    g.act(0).payAuto();
    g.expect.combat({ attackers: [BEARS] });
    g.expect.pending('priority', 0);
  });

  test('without the mana the declaration is refused (the player declares fewer)', () => {
    const g = atAttackers(GATE.name, (b) => b.battlefield(BEARS, 'Mountain'));
    expect(g.act(0).try.declareAttackers([{ attacker: BEARS }]).ok).toBe(false);
    g.act(0).declareAttackers([]);
    g.expect.noEvent({ kind: 'attackersDeclared', attackers: [g.id(BEARS)] });
  });

  test('cancelling the payment takes the declaration back', () => {
    const g = atAttackers(GATE.name, (b) => b.battlefield(BEARS, 'Mountain', 'Mountain'));
    g.act(0).attack(BEARS);
    g.act(0).cancel();
    expect(g.state.pending?.kind).toBe('declareAttackers');
    expect(g.state.combat).toBeNull();
  });

  test('the planeswalker wording taxes an attack on a planeswalker too, paid with {W} or 2 life', () => {
    const g = atAttackers(ANNEX.name, (b) => b.battlefield(BEARS));
    g.act(0).attack(BEARS, WALKER);
    expect(payment(g).totalCost).toEqual(['W/P']);
    g.act(0).payAuto();
    g.expect.combat({ attackers: [BEARS], targets: [{ attacker: BEARS, target: WALKER }] });
    expect(g.state.seats[0]?.life).toBe(38);
  });

  test('a creature attacking someone else pays nothing under the first wording', () => {
    const g = atAttackers(GATE.name, (b) => b.battlefield(BEARS));
    g.act(0).attack(BEARS, WALKER);
    g.expect.combat({ attackers: [BEARS], targets: [{ attacker: BEARS, target: WALKER }] });
    g.expect.pending('priority', 0);
  });
});

describe('"You may choose not to untap ~ during your untap step." (backlog: 44 cards; CR 502.3)', () => {
  const ROD = parsed(
    'SYNTHETIC Parsed Rod',
    'Artifact',
    'You may choose not to untap ~ during your untap step.',
    { manaCost: '{2}' },
  );

  const asked = () => {
    const g = scenario()
      .define(ROD)
      .seat(0)
      .library('Island', { count: 6 })
      .battlefield(ROD.name, { tapped: true })
      .battlefield(BEARS, { tapped: true })
      .seat(1)
      .library('Island', { count: 6 })
      .at('end', { active: 1, turn: 2 })
      .build();
    g.advanceTo('untap', { turn: 'next' });
    return g;
  };

  test('the lowering is the engine ability', () => {
    expect(ROD.faces[0]?.abilities).toEqual([
      { kind: 'static', static: { kind: 'optionalUntap' } },
    ]);
  });

  test('the controller is asked which tapped permanents with it untap; the others untapped already', () => {
    const g = asked();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent' || d.purpose !== 'untap') throw new Error('no question');
    expect(d.legal).toEqual([g.id(ROD.name)]);
    g.expect.tapped(BEARS, false);
    g.expect.tapped(ROD.name, true);
  });

  test('choosing it untaps it, choosing nothing leaves it tapped', () => {
    const yes = asked();
    yes.act(0).choose({ kind: 'choosePermanents', objects: [yes.id(ROD.name)] });
    yes.expect.tapped(ROD.name, false);
    const no = asked();
    no.act(0).choose({ kind: 'choosePermanents', objects: [] });
    no.expect.tapped(ROD.name, true);
    no.expect.step('upkeep', { active: 0, turn: 3 });
  });
});
