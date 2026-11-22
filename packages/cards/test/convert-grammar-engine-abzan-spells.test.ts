// The Abzan Armor precon, group C (spells that make a choice): the REAL Oracle text of its cards (the corpus's golden.jsonl) goes through the grammar with no override, is defined in an
// engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 603.12 (Handling Triggered Abilities:
// reflexive triggers), CR 608.2h and 113.7a (last-known information), CR 701.21a (Sacrifice), CR 101.4 (APNAP order), CR 700.2 (modal spells), CR 115 (targets).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const ANGEL = 'Serra Angel'; // 4/4
const BEARS = 'Grizzly Bears'; // 2/2
const ELVES = 'Llanowar Elves'; // 1/1
const LIBRARY = Array.from({ length: 8 }, () => 'Swamp');

describe('Tip the Scales', () => {
  const tip = real('Tip the Scales');

  const board = (mine: readonly string[], theirs: readonly string[]) =>
    scenario()
      .define(tip)
      .seat(0)
      .library(...LIBRARY)
      .hand(tip.name)
      .battlefield(...mine)
      .pool('CCB')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();

  test('the creature sacrificed is chosen on resolution and its toughness, as it last was, is X (CR 603.12, 608.2h)', () => {
    const g = board([ANGEL, ELVES], [BEARS, ANGEL]);
    g.act(0).cast(tip.name, { pay: true });
    g.passAll();
    // Two creatures: the choice is asked only now, as the spell resolves.
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 0 });
    g.act(0).choosePermanents(`${ANGEL}[0]`);
    // The reflexive ability is on the stack and its X is known (4): players may respond to it.
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a smaller creature sacrificed gives a smaller X: only the creatures with toughness at most X die', () => {
    const g = board([ELVES], [BEARS, ANGEL]);
    g.act(0).cast(tip.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.pt(BEARS, 1, 1);
    g.expect.pt(ANGEL, 3, 3);
    g.expect.invariants();
  });

  test('the controller must sacrifice a creature if they control one, even when it is their only one (CR 701.21a)', () => {
    const g = board([ANGEL], [ANGEL]);
    g.act(0).cast(tip.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
  });

  test('with no creature to sacrifice nothing happens and no reflexive ability triggers (CR 603.12)', () => {
    const g = board([], [ANGEL]);
    g.act(0).cast(tip.name, { pay: true });
    g.passAll();
    g.expect.pt(ANGEL, 4, 4);
    expect(g.state.stack).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('Expel the Interlopers', () => {
  const expel = real('Expel the Interlopers');
  const WALL = 'Wall of Stone'; // 0/8

  const board = (mine: readonly string[], theirs: readonly string[], seats = 2) => {
    const b = scenario({ seats })
      .define(expel)
      .seat(0)
      .library(...LIBRARY)
      .hand(expel.name)
      .battlefield(...mine)
      .pool('CCCWW')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs);
    return (
      seats === 3
        ? b
            .seat(2)
            .library(...LIBRARY)
            .battlefield(BEARS, ANGEL)
        : b
    )
      .at('precombatMain', { active: 0 })
      .build();
  };

  const castAndChoose = (g: ReturnType<typeof board>, n: number) => {
    g.act(0).cast(expel.name, { pay: true });
    g.passAll();
    // CR 608.2d: the controller chooses as the spell resolves, from 0 to 10, both included.
    expect(g.state.pending).toMatchObject({ kind: 'chooseX', seat: 0, min: 0, max: 10 });
    g.act(0).chooseX(n);
  };

  test('destroys every creature, of every player, with power at least the number chosen (CR 608.2c)', () => {
    const g = board([ANGEL, ELVES], [BEARS, ANGEL]);
    castAndChoose(g, 2);
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('the number 0 destroys every creature, a creature with power 0 too (the numbers include 0)', () => {
    const g = board([WALL, ELVES], [BEARS]);
    castAndChoose(g, 0);
    g.expect.zone(WALL, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('the number 10 spares every creature with less power (the numbers include 10)', () => {
    const g = board([ANGEL], [BEARS]);
    castAndChoose(g, 10);
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('a creature with 0 power is spared by 1, which destroys the ones with power 1 or more', () => {
    const g = board([WALL, ELVES], []);
    castAndChoose(g, 1);
    g.expect.zone(WALL, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
  });

  test('a number above 10 is not a legal answer (CR 608.2d)', () => {
    const g = board([ANGEL], []);
    g.act(0).cast(expel.name, { pay: true });
    g.passAll();
    expect(g.act(0).try.action({ kind: 'chooseX', value: 11 }).ok).toBe(false);
    expect(g.act(0).try.action({ kind: 'cancel' }).ok).toBe(false);
  });

  test('with three players it destroys the creatures of all of them', () => {
    const g = board([ANGEL], [ELVES], 3);
    castAndChoose(g, 2);
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 2 });
    g.expect.invariants();
  });
});

describe('Slaughter the Strong', () => {
  const slaughter = real('Slaughter the Strong');
  const WALL = 'Wall of Stone'; // 0/8

  const board = (seats: readonly (readonly string[])[], active = 0) => {
    let b = scenario({ seats: seats.length });
    seats.forEach((creatures, seat) => {
      b = b
        .seat(seat)
        .library(...LIBRARY)
        .battlefield(...creatures);
    });
    return b
      .define(slaughter)
      .seat(active)
      .hand(slaughter.name)
      .pool('CWW')
      .at('precombatMain', { active })
      .build();
  };

  test('each player, active player first, chooses creatures to keep with total power 4 or less (CR 101.4, 608.2d)', () => {
    const g = board([
      [ANGEL, BEARS, ELVES],
      [BEARS, BEARS, ANGEL],
    ]);
    g.act(0).cast(slaughter.name, { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({
      kind: 'choosePermanent',
      purpose: 'keep',
      seat: 0,
      min: 0,
      max: 3,
      maxTotalPower: 4,
    });
    // The powers the engine reads are the ones the player sees: 4, 2 and 1 (the whole choice of 4 + 2 + 1 is more than 4).
    const d = g.state.pending;
    expect(d?.kind === 'choosePermanent' ? Object.values(d.powers ?? {}).sort() : []).toEqual([
      1, 2, 4,
    ]);
    // Keeping nothing is always a legal answer.
    expect(g.act(0).try.action({ kind: 'choosePermanents', objects: [] }).ok).toBe(true);
  });

  test('the creatures not kept are all sacrificed at once after the last player chose, and the later player knows the earlier choice', () => {
    const g = board([
      [ANGEL, BEARS, ELVES],
      [BEARS, BEARS, ANGEL],
    ]);
    g.act(0).cast(slaughter.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(`${BEARS}[0]`, `${ELVES}[0]`);
    // Nothing is sacrificed before the last player has chosen.
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', purpose: 'keep', seat: 1 });
    g.act(1).choosePermanents(`${BEARS}[0]`, `${BEARS}[1]`);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });

  test('a choice with total power above 4 is refused', () => {
    const g = board([[ANGEL, ELVES], []]);
    g.act(0).cast(slaughter.name, { pay: true });
    g.passAll();
    const r = g.act(0).try.action({
      kind: 'choosePermanents',
      objects: g.state.pending?.kind === 'choosePermanent' ? [...g.state.pending.legal] : [],
    });
    expect(r.ok).toBe(false);
    g.act(0).choosePermanents(`${ANGEL}[0]`);
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
  });

  test('a creature with power 0 never counts against the limit', () => {
    const g = board([[WALL, ANGEL, BEARS], []]);
    g.act(0).cast(slaughter.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(`${WALL}[0]`, `${ANGEL}[0]`);
    g.expect.zone(WALL, 'battlefield', { seat: 0 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('a player with no creature is not asked, and a player who keeps none sacrifices all', () => {
    const g = board([[ANGEL], []]);
    g.act(0).cast(slaughter.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    expect(g.state.pending).not.toMatchObject({ purpose: 'keep' });
  });

  test('with three players they choose in turn order from the active player (APNAP), each knowing the earlier choices', () => {
    const g = board([[ANGEL], [BEARS, ELVES], [ELVES, ELVES, BEARS]], 1);
    g.act(1).cast(slaughter.name, { pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ purpose: 'keep', seat: 1 });
    g.act(1).choosePermanents(`${BEARS}[0]`, `${ELVES}[0]`);
    expect(g.state.pending).toMatchObject({ purpose: 'keep', seat: 2 });
    g.act(2).choosePermanents(`${ELVES}[0]`, `${ELVES}[1]`);
    expect(g.state.pending).toMatchObject({ purpose: 'keep', seat: 0 });
    g.act(0).choosePermanents(`${ANGEL}[0]`);
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
    g.expect.zone(ELVES, 'battlefield', { seat: 2 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });
});

describe('Reunion of the House', () => {
  const reunion = real('Reunion of the House');
  const WALL = 'Wall of Stone'; // 0/8
  const BOLT = 'Lightning Bolt';

  const board = (
    graveyard: readonly string[],
    theirs: readonly string[] = [],
    extra = scenario(),
  ) =>
    extra
      .define(reunion)
      .seat(0)
      .library(...LIBRARY)
      .hand(reunion.name, BOLT)
      .graveyard(...graveyard)
      .pool('CCCCCWWR')
      .seat(1)
      .library(...LIBRARY)
      .graveyard(...theirs)
      .at('precombatMain', { active: 0 })
      .build();

  test('returns every target to the battlefield under the control of the caster and exiles itself (CR 110.2a, 608.2c)', () => {
    const g = board([ANGEL, ANGEL, BEARS, ELVES]);
    g.act(0).cast(reunion.name, { targets: [`${ANGEL}[0]`, `${ANGEL}[1]`, BEARS], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(reunion.name, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('total power above 10 is not a legal choice of targets (CR 601.2c)', () => {
    const g = board([ANGEL, ANGEL, BEARS, ELVES]);
    expect(() =>
      g
        .act(0)
        .cast(reunion.name, { targets: [`${ANGEL}[0]`, `${ANGEL}[1]`, BEARS, ELVES], pay: true }),
    ).toThrow(/total power 10 or less/);
  });

  test('creatures with power 0 never count against the limit, and any number of targets may be none', () => {
    const g = board([ANGEL, ANGEL, BEARS, WALL]);
    g.act(0).cast(reunion.name, {
      targets: [`${ANGEL}[0]`, `${ANGEL}[1]`, BEARS, WALL],
      pay: true,
    });
    g.passAll();
    g.expect.zone(WALL, 'battlefield', { seat: 0 });
    const none = board([ANGEL]);
    none.act(0).cast(reunion.name, { targets: [], pay: true });
    none.passAll();
    none.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    none.expect.zone(reunion.name, 'exile', { seat: 0 });
  });

  test('only creature cards of the graveyard of the caster are targets', () => {
    const g = board([ANGEL], [BEARS]);
    expect(() => g.act(0).cast(reunion.name, { targets: [BEARS], pay: true })).toThrow();
  });

  test('a power that changes while the spell is on the stack makes the whole selection illegal: nothing returns (CR 608.2b)', () => {
    // SYNTHETIC creature card: its power is the number of cards in its owner's graveyard (a characteristic-defining ability, CR 604.3, which works in the graveyard).
    const sizeable = parsed(
      'SYNTHETIC Graveyard Giant',
      'Creature — Giant',
      "~'s power is equal to the number of cards in your graveyard.",
      { manaCost: '{3}{B}', power: '*', toughness: '2', colors: ['B'] },
    );
    const g = board([sizeable.name, ANGEL, BEARS, 'Swamp'], [], scenario().define(sizeable));
    // 4 cards in the graveyard: 4 + 4 + 2 = 10, a legal choice.
    g.act(0).cast(reunion.name, { targets: [sizeable.name, ANGEL, BEARS], pay: true });
    // In response a Lightning Bolt is cast: it goes to the graveyard as it resolves, so the power of the Giant is 5 and the total 11.
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(sizeable.name, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(reunion.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Will of the Abzan', () => {
  const will = real('Will of the Abzan');
  const YARGLE = 'Yargle, Glutton of Urborg'; // legendary 9/3

  interface Board {
    readonly mine?: readonly string[];
    readonly myCommander?: boolean;
    readonly graveyard?: readonly string[];
    readonly theirs?: readonly (readonly string[])[];
  }
  const board = ({
    mine = [],
    myCommander = false,
    graveyard = [],
    theirs = [[ANGEL, BEARS]],
  }: Board) => {
    let b = scenario({ seats: theirs.length + 1 })
      .define(will)
      .seat(0)
      .library(...LIBRARY)
      .hand(will.name)
      .graveyard(...graveyard)
      .pool('CCCB');
    if (myCommander) b = b.battlefield(YARGLE, { commander: true });
    b = b.battlefield(...mine);
    theirs.forEach((creatures, i) => {
      b = b
        .seat(i + 1)
        .library(...LIBRARY)
        .battlefield(...creatures);
    });
    return b.at('precombatMain', { active: 0 }).build();
  };

  test('without a commander only one mode may be chosen (CR 700.2)', () => {
    const g = board({ graveyard: [ELVES] });
    g.act(0).cast(will.name, { pay: false });
    expect(g.state.pending).toMatchObject({ kind: 'chooseModes', min: 1, max: 1 });
  });

  test('with a commander the caster controls both modes may be chosen instead (CR 700.2)', () => {
    const g = board({ graveyard: [ELVES], myCommander: true });
    g.act(0).cast(will.name, { pay: false });
    expect(g.state.pending).toMatchObject({ kind: 'chooseModes', min: 1, max: 2 });
  });

  test('a commander of another player the caster controls counts: it does not have to be their own', () => {
    const g = scenario()
      .define(will)
      .seat(0)
      .library(...LIBRARY)
      .hand(will.name)
      .graveyard(ELVES)
      .pool('CCCB')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(YARGLE, { commander: true, controller: 0 })
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(will.name, { pay: false });
    expect(g.state.pending).toMatchObject({ kind: 'chooseModes', min: 1, max: 2 });
  });

  test('each target opponent sacrifices the creature with the greatest power they control and loses 3 life (CR 701.21a)', () => {
    const g = board({ theirs: [[ANGEL, BEARS], [BEARS, ELVES], [ELVES]] });
    g.act(0).cast(will.name, {
      modes: [0],
      targets: [{ player: 1 }, { player: 2 }],
      pay: true,
    });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.life(1, 37);
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
    g.expect.zone(ELVES, 'battlefield', { seat: 2 });
    g.expect.life(2, 37);
    // The opponent who was not targeted keeps everything.
    g.expect.zone(ELVES, 'battlefield', { seat: 3 });
    g.expect.life(3, 40);
    g.expect.invariants();
  });

  test('with two creatures tied for the greatest power the opponent chooses which to sacrifice (CR 608.2d)', () => {
    const g = board({ theirs: [[BEARS, BEARS, ELVES]] });
    g.act(0).cast(will.name, { modes: [0], targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.state.pending).toMatchObject({ kind: 'choosePermanent', seat: 1 });
    g.act(1).choosePermanents(`${BEARS}[1]`);
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.life(1, 37);
  });

  test('an opponent with no creature still loses 3 life, and no opponent may be targeted at all', () => {
    const g = board({ theirs: [[]] });
    g.act(0).cast(will.name, { modes: [0], targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    const none = board({ theirs: [[ANGEL]] });
    none.act(0).cast(will.name, { modes: [0], targets: [], pay: true });
    none.passAll();
    none.expect.zone(ANGEL, 'battlefield', { seat: 1 });
    none.expect.life(1, 40);
  });

  test('the second mode returns a creature card from the graveyard of the caster to the battlefield', () => {
    const g = board({ graveyard: [ELVES] });
    g.act(0).cast(will.name, { modes: [1], targets: [ELVES], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('with a commander both modes happen, in the order of the card: sacrifice and life loss first, then the return (CR 700.2)', () => {
    const g = board({ graveyard: [ELVES], myCommander: true, theirs: [[ANGEL, BEARS], [BEARS]] });
    g.act(0).cast(will.name, {
      modes: [0, 1],
      targets: [{ player: 1 }, { player: 2 }, ELVES],
      pay: true,
    });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 2 });
    g.expect.life(1, 37);
    g.expect.life(2, 37);
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});
