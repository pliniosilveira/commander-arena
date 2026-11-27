// Sauron deck, the cost group: the REAL Oracle text of Sauron, the Dark Lord, Mount Doom and Orcish Medicine (the corpus's golden.jsonl) goes through the grammar with no override and is
// played through applyAction with two to four players. The artifact and creature stand-ins are SYNTHETIC (named so).
// Pins: CR 702.21a (Ward: counter the spell or ability unless that player pays [cost]), CR 701.21a (sacrifice: the payer chooses among the permanents they control), CR 118.3 (a cost that
// cannot be paid is not paid), CR 602.2b (Mount Doom: the source and a different permanent are sacrificed together as the cost), CR 608.2d (a choice made as an effect resolves is no target:
// a creature with shroud may be chosen), CR 701.8a and 702.12b (destroy; an indestructible creature is not destroyed), CR 611.2a (a keyword granted for the turn), CR 701.54a (the Ring
// tempts you), CR 701.47a (amass).
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard } from '../src/index';
import { real } from './agatha-helpers';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const FILLER = Array.from({ length: 12 }, () => 'Island');
const BEARS = 'Grizzly Bears'; // 2/2
const BOLT = 'Lightning Bolt';

/** A SYNTHETIC card read by the grammar alone. */
function synthetic(
  name: string,
  typeLine: string,
  oracleText: string,
  pt?: readonly [string, string],
): CardDefinition {
  const imported = importCard(
    syntheticCard({
      name,
      manaCost: '{1}',
      typeLine,
      oracleText,
      power: pt?.[0] ?? null,
      toughness: pt?.[1] ?? null,
    }),
    undefined,
    NO_OVERRIDES,
  );
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const RING = synthetic('SYNTHETIC Legendary Trinket', 'Legendary Artifact', '');
const KING = synthetic('SYNTHETIC Legendary Knight', 'Legendary Creature — Human Knight', '', [
  '1',
  '1',
]);
const SHROUDED = synthetic('SYNTHETIC Shrouded Bear', 'Creature — Bear', 'Shroud', ['2', '2']);
const HARDY = synthetic('SYNTHETIC Hardy Bear', 'Creature — Bear', 'Indestructible', ['2', '2']);
const ARMY = synthetic('SYNTHETIC Marching Army', 'Creature — Army', '', ['2', '2']);

/** Orders the two triggers Sauron has when an opponent casts a spell at it, ward and amass, as they are listed. */
function orderWardAndAmass(g: ScenarioGame) {
  if (g.state.pending?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
}

describe('Sauron, the Dark Lord: "Ward—Sacrifice a legendary artifact or legendary creature."', () => {
  const SAURON = real('Sauron, the Dark Lord');

  /** Seat 1 casts Lightning Bolt at Sauron (seat 0) with `payer`'s permanents on the battlefield. */
  const start = (seats: 2 | 3 | 4, ...theirs: readonly string[]) => {
    const b = scenario({ seats }).define(SAURON).define(RING).define(KING);
    b.seat(0)
      .library(...FILLER)
      .battlefield(SAURON.name);
    b.seat(1)
      .library(...FILLER)
      .hand(BOLT, { label: 'bolt' })
      .battlefield('Mountain', { count: 2 })
      .battlefield(...theirs);
    for (let seat = 2; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
    return b.at('precombatMain', { active: 1, turn: 3 }).build();
  };

  test('the card is supported with a sacrifice cost on its ward', () => {
    expect(validateCard(SAURON)).toEqual([]);
    const ward = SAURON.faces[0]?.abilities.find((a) => a.kind === 'keyword');
    expect(ward).toMatchObject({ keyword: { kind: 'ward', cost: [{ kind: 'sacrifice' }] } });
  });

  test('the opponent who casts the spell pays with the one legendary artifact it has and the spell resolves (four players)', () => {
    const g = start(4, RING.name, BEARS);
    g.act(1).cast('bolt', { targets: [SAURON.name], pay: true });
    // Sauron's other trigger (an opponent cast a spell) waits above the ward trigger or below it: resolve until the ward question.
    orderWardAndAmass(g);
    g.passAll();
    g.expect.pending('confirmOptional', 1);
    g.act(1).accept();
    g.expect.zone(RING.name, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.noEvent({ kind: 'countered' });
  });

  test('with a legendary artifact and a legendary creature the payer chooses which to sacrifice', () => {
    const g = start(3, RING.name, KING.name, BEARS);
    g.act(1).cast('bolt', { targets: [SAURON.name], pay: true });
    orderWardAndAmass(g);
    g.passAll();
    g.act(1).accept();
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(KING.name);
    g.expect.zone(KING.name, 'graveyard', { seat: 1 });
    g.expect.zone(RING.name, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('with nothing legendary the spell is countered at once and nobody is asked', () => {
    const g = start(2, BEARS);
    const mark = g.mark();
    g.act(1).cast('bolt', { targets: [SAURON.name], pay: true });
    orderWardAndAmass(g);
    g.passAll();
    expect(g.eventsSince(mark)).toContainEqual(expect.objectContaining({ kind: 'countered' }));
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(SAURON.name, 'battlefield', { seat: 0 });
  });

  test('"Whenever an opponent casts a spell, amass Orcs 1": the Army token is 1/1 (three opponents)', () => {
    const g = start(4, BEARS);
    g.act(1).cast('bolt', { targets: [BEARS], pay: true });
    g.passAll();
    const army = Object.values(g.state.objects).find(
      (o) => o.zone === 'battlefield' && o.controller === 0 && o.token !== null,
    );
    expect(army?.counters).toEqual({ '+1/+1': 1 });
  });
});

describe('Sauron, the Dark Lord: the Ring tempts you when an Army deals combat damage to a player', () => {
  const SAURON = real('Sauron, the Dark Lord');

  test('Army combat damage tempts, and the discard-and-draw trigger of the Ring follows (three opponents)', () => {
    const b = scenario({ seats: 4 }).define(SAURON).define(ARMY);
    b.seat(0)
      .library(...FILLER)
      .hand(BEARS, { label: 'h1' })
      .hand(BEARS, { label: 'h2' })
      .battlefield(SAURON.name)
      .battlefield(ARMY.name, { label: 'army' });
    for (let seat = 1; seat < 4; seat += 1) b.seat(seat).library(...FILLER);
    const g = b.at('precombatMain', { active: 0, turn: 3 }).build();
    g.advanceTo('declareAttackers');
    g.act(0).attack('army', { player: 2 });
    g.advanceTo('combatDamage');
    g.passAll();
    // The Ring tempts (a Ring-bearer is chosen among Sauron and the Army), then the discard trigger asks.
    if (g.state.pending?.kind === 'choosePermanent') g.act(0).choosePermanents(SAURON.name);
    g.passAll();
    if (g.state.pending?.kind === 'confirmOptional') g.act(0).accept();
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(4);
  });
});

describe('Mount Doom: "Choose up to two creatures, then destroy the rest."', () => {
  const DOOM = real('Mount Doom');

  const start = (seats: 2 | 3 | 4, mine: readonly string[]) => {
    const b = scenario({ seats })
      .define(DOOM)
      .define(RING)
      .define(SHROUDED)
      .define(HARDY)
      .define(KING);
    b.seat(0)
      .library(...FILLER)
      .battlefield(DOOM.name)
      .battlefield('Swamp', { count: 4 })
      .battlefield('Mountain', { count: 4 })
      .battlefield(...mine);
    b.seat(1)
      .library(...FILLER)
      .battlefield('Giant Spider', { label: 'spider' })
      .battlefield(SHROUDED.name);
    if (seats > 2) {
      b.seat(2)
        .library(...FILLER)
        .battlefield('Serra Angel', { label: 'angel' })
        .battlefield(HARDY.name);
    }
    for (let seat = 3; seat < seats; seat += 1) {
      b.seat(seat)
        .library(...FILLER)
        .battlefield('Llanowar Elves');
    }
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('both the land and the legendary artifact are sacrificed as the cost, then the controller chooses among every creature (four players)', () => {
    const g = start(4, [RING.name, BEARS]);
    g.act(0).activate(DOOM.name, { ability: 2, pay: true });
    g.expect.zone(DOOM.name, 'graveyard', { seat: 0 });
    g.expect.zone(RING.name, 'graveyard', { seat: 0 });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    // Everyone's creatures are offered, a creature with shroud among them: nothing targets (CR 608.2d).
    expect(d.legal).toHaveLength(6);
    expect([d.min, d.max]).toEqual([0, 2]);
    g.act(0).choosePermanents(BEARS, { name: SHROUDED.name, seat: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(SHROUDED.name, 'battlefield', { seat: 1 });
    g.expect.zone('Giant Spider', 'graveyard', { seat: 1 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 2 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 3 });
    // An indestructible creature that was not chosen is not destroyed (CR 702.12b).
    g.expect.zone(HARDY.name, 'battlefield', { seat: 2 });
    g.expect.invariants();
  });

  test('choosing none destroys every creature but the indestructible ones', () => {
    const g = start(3, [RING.name, BEARS]);
    g.act(0).activate(DOOM.name, { ability: 2, pay: true });
    g.passAll();
    g.act(0).choosePermanents();
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(SHROUDED.name, 'graveyard', { seat: 1 });
    g.expect.zone(HARDY.name, 'battlefield', { seat: 2 });
  });

  test('without a legendary artifact the ability is not offered (CR 118.3)', () => {
    const g = start(2, [BEARS]);
    expect(g.act(0).try.activate(DOOM.name, { ability: 2 }).ok).toBe(false);
    g.expect.zone(DOOM.name, 'battlefield', { seat: 0 });
  });

  test('it is a sorcery-speed ability: not offered on the opponent turn', () => {
    const g = start(2, [RING.name]);
    g.advanceTo('declareAttackers');
    expect(g.act(0).try.activate(DOOM.name, { ability: 2 }).ok).toBe(false);
  });
});

describe('Orcish Medicine: "Target creature gains your choice of lifelink or indestructible until end of turn."', () => {
  const MEDICINE = real('Orcish Medicine');

  const start = (seats: 2 | 3 | 4) => {
    const b = scenario({ seats }).define(MEDICINE);
    b.seat(0)
      .library(...FILLER)
      .hand(MEDICINE.name, { label: 'med' })
      .battlefield('Swamp', { count: 3 })
      .battlefield(BEARS);
    for (let seat = 1; seat < seats; seat += 1) b.seat(seat).library(...FILLER);
    return b.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('the controller chooses as it resolves: lifelink, and not indestructible', () => {
    const g = start(4);
    g.act(0).cast('med', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('lifelink');
    g.expect.derived(BEARS, { keywords: ['lifelink'] });
  });

  test('indestructible is the other choice', () => {
    const g = start(2);
    g.act(0).cast('med', { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).chooseOption('indestructible');
    g.expect.derived(BEARS, { keywords: ['indestructible'] });
  });

  test('the amass of the second paragraph still happens', () => {
    const g = start(2);
    g.act(0).cast('med', { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).chooseOption('lifelink');
    expect(
      Object.values(g.state.objects).filter(
        (o) => o.zone === 'battlefield' && o.controller === 0 && o.token !== null,
      ),
    ).toHaveLength(1);
  });
});
