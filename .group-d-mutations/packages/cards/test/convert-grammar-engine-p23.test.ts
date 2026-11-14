// Parsed text is only worth something if the engine runs it as written (stage P23). These tests import SYNTHETIC
// cards through the grammar (never through a fixture), define them in an engine scenario and play them through
// applyAction: Spectacle (CR 702.137), Escape (CR 702.138, with the real sacrifice line "When ~ enters, sacrifice it
// unless it escaped.") and Unearth (CR 702.84), the second slice of named alternative costs of D-117 and D-124.
// Every card name starts with "SYNTHETIC"; the keyword lines are the real ones of reports/templates.json
// ("Spectacle {R}", "Escape—{G}{G}{U}{U}, Exile five other cards from your graveyard.", "Unearth {R}") with other
// costs and counts SYNTHETIC. No real card's text is claimed. The board uses the engine's own fixtures
// (Lightning Bolt, Grizzly Bears, Giant Spider, Typhoid Rats, the basic lands).
import { getLegalActions, getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Grizzly Bears', 'Giant Spider', 'Typhoid Rats', 'Youthful Knight', 'Fencing Ace'];

const options = (g: ScenarioGame, kind: 'spectacle' | 'escape') =>
  getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell' && a.alternative === kind);

describe('"Spectacle {1}{R}" (backlog: 11 cards; CR 702.137a)', () => {
  const RAIDER = parsed('SYNTHETIC Parsed Raider', 'Creature — Test', 'Spectacle {1}{R}', {
    manaCost: '{3}{R}',
    power: '2',
    toughness: '2',
    colors: ['R'],
  });

  test('the lowering is the face field', () => {
    expect(RAIDER.faces[0]?.alternativeCosts).toEqual([
      { kind: 'spectacle', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
    ]);
    expect(RAIDER.faces[0]?.abilities).toEqual([]);
  });

  test('before an opponent lost life only the ordinary cast exists; with two lands nothing can be cast', () => {
    const g = scenario()
      .define(RAIDER)
      .seat(0)
      .hand(RAIDER.name)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    expect(options(g, 'spectacle')).toEqual([]);
    g.expect.illegal(0, { cast: RAIDER.name });
  });

  test('after a Lightning Bolt hit the opponent the spectacle cast is offered and costs {1}{R}', () => {
    const g = scenario()
      .define(RAIDER)
      .seat(0)
      .hand(RAIDER.name, 'Lightning Bolt')
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .build();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.illegal(0, { cast: RAIDER.name });
    g.expect.legal(0, { cast: RAIDER.name, alternative: 'spectacle' });
    expect(getView(g.state, 0).seats[0]?.hand?.[0]?.alternativeCosts).toEqual([
      { kind: 'spectacle', cost: ['1', 'R'] },
    ]);
    g.act(0).cast(RAIDER.name, { alternative: 'spectacle', pay: true });
    g.passAll();
    g.expect.zone(RAIDER.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('"Escape—{B}{B}, Exile three other cards from your graveyard." and "sacrifice it unless it escaped"', () => {
  // The two real lines of Uro (the others are not in the repository), with a SYNTHETIC cost and count.
  const WRAITH = parsed(
    'SYNTHETIC Parsed Wraith',
    'Creature — Test',
    'When ~ enters, sacrifice it unless it escaped.\nEscape—{B}{B}, Exile three other cards from your graveyard.',
    { manaCost: '{3}{B}', power: '3', toughness: '3', colors: ['B'] },
  );

  const board = (others: number, lands = 6) => {
    const b = scenario().define(WRAITH).seat(0).graveyard(WRAITH.name);
    for (const name of FILLER.slice(0, others)) b.graveyard(name);
    return b.battlefield('Swamp', { count: lands }).seat(1).build();
  };

  test('the lowering is the face field and the trigger with its intervening "not escaped"', () => {
    const face = WRAITH.faces[0];
    expect(face?.alternativeCosts).toEqual([
      { kind: 'escape', cost: [{ kind: 'mana', symbols: ['B', 'B'] }], exile: 3 },
    ]);
    expect(face?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
        effect: { kind: 'sacrifice', objects: { kind: 'this' } },
        interveningIf: { kind: 'not', term: { kind: 'escaped' } },
      },
    ]);
  });

  test('three other cards and {B}{B}: the escape cast from the graveyard is offered; two are too few', () => {
    const g = board(3);
    g.expect.legal(0, { cast: WRAITH.name, alternative: 'escape' });
    expect(options(g, 'escape')).toHaveLength(1);
    expect(options(board(2), 'escape')).toEqual([]);
    expect(
      getView(g.state, 0).seats[0]?.graveyard.find((o) => o.name === WRAITH.name),
    ).toMatchObject({ alternativeCosts: [{ kind: 'escape', cost: ['B', 'B'], exile: 3 }] });
  });

  test('escaping exiles three other cards, the creature stays and its trigger does not happen', () => {
    const g = board(3);
    g.act(0).cast(WRAITH.name, { alternative: 'escape', pay: true });
    for (const name of FILLER.slice(0, 3)) g.expect.zone(name, 'exile', { seat: 0 });
    g.passAll();
    g.expect.zone(WRAITH.name, 'battlefield', { seat: 0 });
    g.expect.noEvent({ kind: 'abilityTriggered' });
    g.expect.stack([]);
    g.expect.invariants();
  });

  test('with more other cards than needed the caster chooses which are exiled', () => {
    const g = board(5);
    g.act(0).cast(WRAITH.name, { alternative: 'escape', pay: true });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Grizzly Bears', 'Giant Spider', 'Typhoid Rats');
    g.expect.zone('Youthful Knight', 'graveyard', { seat: 0 });
    g.expect.zone('Fencing Ace', 'graveyard', { seat: 0 });
    g.expect.zone('Typhoid Rats', 'exile', { seat: 0 });
    g.passAll();
    g.expect.zone(WRAITH.name, 'battlefield', { seat: 0 });
  });

  test('cast from the hand for its mana cost it is sacrificed by its own trigger', () => {
    const g = scenario()
      .define(WRAITH)
      .seat(0)
      .hand(WRAITH.name)
      .battlefield('Swamp', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast(WRAITH.name, { pay: true });
    g.pass(0);
    g.pass(1);
    g.expect.stack([`${WRAITH.name} (ability)`]);
    g.passAll();
    g.expect.zone(WRAITH.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('"Unearth {R}" (backlog: 55 cards; CR 702.84a)', () => {
  const GNOLL = parsed('SYNTHETIC Parsed Gnoll', 'Creature — Test', 'Unearth {R}', {
    manaCost: '{2}{R}{R}',
    power: '3',
    toughness: '1',
    colors: ['R'],
  });

  const gnollGame = () =>
    scenario()
      .define(GNOLL)
      .seat(0)
      .graveyard(GNOLL.name)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();

  test('the lowering is the keyword, which the engine turns into an ability of the graveyard', () => {
    expect(GNOLL.faces[0]?.abilities).toEqual([
      { kind: 'keyword', keyword: { kind: 'unearth', cost: [{ kind: 'mana', symbols: ['R'] }] } },
    ]);
    const g = gnollGame();
    g.expect.legal(0, { activate: GNOLL.name });
  });

  test('activated it returns with haste, attacks, and is exiled at the beginning of the end step', () => {
    const g = gnollGame();
    g.act(0).activate(GNOLL.name, { pay: true });
    g.expect.zone(GNOLL.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(GNOLL.name, 'battlefield', { seat: 0 });
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(GNOLL.name, true);
    g.playCombat({ attack: [GNOLL.name], until: 'postcombatMain' });
    g.expect.life(1, 37);
    g.advanceTo('end');
    g.expect.stack([`${GNOLL.name} (ability)`]);
    g.passAll();
    g.expect.zone(GNOLL.name, 'exile', { seat: 0 });
    g.expect.noObject(GNOLL.name, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('a card of the same text cast from the hand has no unearth option while it is in the hand', () => {
    const g = scenario()
      .define(GNOLL)
      .seat(0)
      .hand(GNOLL.name)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    expect(getLegalActions(g.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);
  });
});
