// The Mind Flayarrrs deck, group 4: the REAL Oracle text of Mindcrank, Zellix, Sanity Flayer and Chasm Skulker from the golden corpus goes through the grammar as a card with no override,
// is defined in an engine scenario and is played through applyAction. Pins: CR 119.3 (a life loss is an event with an amount; "that many" is the life lost), CR 701.17a (Mill: the cards one
// player mills in one instruction are one event), CR 603.2c ("one or more" triggers once), CR 603.10a and 113.7a (a creature that died is read as it last was: its counters), CR 702.14a
// (Landwalk), CR 102.1 and 800.4 (each opponent in a game of three or four seats).
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
  return imported.definition;
}

const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

/** SYNTHETIC: "Each opponent loses 3 life." and "Target player loses 5 life." and "Target player mills three cards." */
const DRAIN = parsed('SYNTHETIC Parsed Drain', 'Sorcery', 'Each opponent loses 3 life.', {
  manaCost: '{B}',
});
const SIPHON = parsed('SYNTHETIC Parsed Siphon', 'Sorcery', 'Target player loses 5 life.', {
  manaCost: '{B}',
});
const MILL_THREE = parsed('SYNTHETIC Parsed Grind', 'Sorcery', 'Target player mills three cards.', {
  manaCost: '{U}',
});

describe('Mindcrank: "Whenever an opponent loses life, that player mills that many cards."', () => {
  const crank = real('Mindcrank');
  const CRANK = crank.name;

  test('the trigger carries the life lost of the event', () => {
    expect(validateCard(crank)).toEqual([]);
    expect(crank.faces[0]?.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'lifeLost', who: 'opponent' },
        effect: {
          kind: 'mill',
          player: { kind: 'triggerPlayer' },
          count: { kind: 'triggerDamage' },
        },
      },
    ]);
  });

  const start = (seats: 2 | 3 | 4) => {
    let s = scenario({ seats })
      .define(crank)
      .define(DRAIN)
      .define(SIPHON)
      .seat(0)
      .library(...LIBRARY)
      .hand(DRAIN.name, SIPHON.name, BOLT)
      .battlefield('Swamp', { count: 3 })
      .battlefield('Mountain')
      .battlefield(CRANK);
    for (let seat = 1; seat < seats; seat += 1) s = s.seat(seat).library(...LIBRARY);
    return s.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('each opponent that loses life mills that many cards, whatever the number of seats', () => {
    for (const seats of [2, 3, 4] as const) {
      const g = start(seats);
      g.act(0).cast(DRAIN.name, { pay: true });
      g.passAll();
      // One trigger for each opponent: the controller puts them on the stack in any order (CR 603.3b).
      if (g.state.pending?.kind === 'orderTriggers') {
        g.act(0).orderTriggers(...Array.from({ length: seats - 1 }, (_, i) => i));
        g.passAll();
      }
      g.expect.librarySize(0, 12);
      for (let seat = 1; seat < seats; seat += 1) {
        g.expect.life(seat, 37);
        g.expect.librarySize(seat, 9);
      }
    }
  });

  test('only the opponent who lost life mills, and as many cards as the life they lost', () => {
    const g = start(4);
    g.act(0).cast(SIPHON.name, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.expect.life(2, 35);
    g.expect.librarySize(2, 7);
    g.expect.librarySize(1, 12);
    g.expect.librarySize(3, 12);
    g.expect.librarySize(0, 12);
  });

  test('damage is a loss of life too (CR 119.3)', () => {
    const g = start(3);
    g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 37);
    g.expect.librarySize(1, 9);
    g.expect.librarySize(2, 12);
  });

  test('the controller losing life mills nobody', () => {
    const g = start(3);
    g.act(0).cast(BOLT, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 37);
    g.expect.librarySize(0, 12);
    g.expect.librarySize(1, 12);
    g.expect.librarySize(2, 12);
  });
});

describe('Zellix, Sanity Flayer: "Whenever a player mills one or more creature cards, you create a 1/1 black Horror creature token."', () => {
  const zellix = real('Zellix, Sanity Flayer');

  test('the trigger is a mill trigger of any player with a creature filter', () => {
    expect(validateCard(zellix)).toEqual([]);
    expect(zellix.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'milled', who: 'any', filter: { types: ['creature'] } },
    });
  });

  const start = (seats: 2 | 3 | 4, library: readonly string[]) => {
    let s = scenario({ seats })
      .define(zellix)
      .define(MILL_THREE)
      .seat(0)
      .library(...LIBRARY)
      .hand(MILL_THREE.name)
      .battlefield('Island')
      .battlefield(zellix.name);
    for (let seat = 1; seat < seats; seat += 1) s = s.seat(seat).library(...library);
    return s.at('precombatMain', { active: 0, turn: 3 }).build();
  };

  test('a creature card among the cards another player mills makes one Horror for the controller', () => {
    const g = start(2, [BEARS, 'Plains', 'Plains', 'Plains']);
    g.act(0).cast(MILL_THREE.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone('Horror', 'battlefield', { seat: 0, count: 1 });
  });

  test('two creature cards milled by one instruction are one event: one Horror (CR 603.2c)', () => {
    const g = start(3, [BEARS, BEARS, 'Plains', 'Plains']);
    g.act(0).cast(MILL_THREE.name, { targets: [{ player: 2 }], pay: true });
    g.passAll();
    g.expect.zone('Horror', 'battlefield', { seat: 0, count: 1 });
    g.expect.noObject('Horror', { zone: 'battlefield', seat: 2 });
  });

  test('no creature card among them: no Horror', () => {
    const g = start(4, ['Plains', 'Plains', 'Plains', BEARS]);
    g.act(0).cast(MILL_THREE.name, { targets: [{ player: 3 }], pay: true });
    g.passAll();
    g.expect.noObject('Horror');
  });

  test('a library with no cards mills nothing and triggers nothing', () => {
    const g = start(2, []);
    g.act(0).cast(MILL_THREE.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.noObject('Horror');
  });

  test('the controller milling their own creature cards counts: "a player"', () => {
    const own = scenario()
      .define(zellix)
      .define(MILL_THREE)
      .seat(0)
      .library(BEARS, 'Plains', 'Plains', 'Plains')
      .hand(MILL_THREE.name)
      .battlefield('Island')
      .battlefield(zellix.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    own.act(0).cast(MILL_THREE.name, { targets: [{ player: 0 }], pay: true });
    own.passAll();
    own.expect.zone('Horror', 'battlefield', { seat: 0, count: 1 });
  });
});

describe('Chasm Skulker: "When this creature dies, create X 1/1 blue Squid creature tokens with islandwalk, where X is the number of +1/+1 counters on this creature."', () => {
  const skulker = real('Chasm Skulker');

  test('the death trigger counts the counters of the creature as it last existed', () => {
    expect(validateCard(skulker)).toEqual([]);
    const dies = skulker.faces[0]?.abilities.find(
      (a) => a.kind === 'triggered' && a.trigger.kind === 'dies',
    );
    expect(dies).toMatchObject({
      effect: {
        kind: 'createToken',
        count: { kind: 'countersOn', of: { kind: 'this' }, counter: '+1/+1' },
      },
    });
  });

  const start = (counters: Readonly<Record<string, number>>) =>
    scenario()
      .define(skulker)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT)
      .battlefield('Mountain')
      .battlefield(skulker.name, { label: 'skulker', counters })
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('three +1/+1 counters make a 4/4 that a bolt does not kill: nothing dies, no token', () => {
    const g = start({ '+1/+1': 3 });
    g.act(0).cast(BOLT, { targets: ['skulker'], pay: true });
    g.passAll();
    g.expect.noObject('Squid');
  });

  test('two +1/+1 counters: the 3/3 dies to a bolt and leaves two Squid tokens with islandwalk', () => {
    const g = start({ '+1/+1': 2 });
    g.act(0).cast(BOLT, { targets: ['skulker'], pay: true });
    g.passAll();
    g.expect.zone(skulker.name, 'graveyard', { seat: 0 });
    g.expect.zone('Squid', 'battlefield', { seat: 0, count: 2 });
    g.expect.pt('Squid[0]', 1, 1);
    g.expect.derived('Squid[0]', { colors: ['U'], subtypes: ['Squid'], keywords: ['landwalk'] });
  });

  test('no counters: the 1/1 dies and no token is created', () => {
    const g = start({});
    g.act(0).cast(BOLT, { targets: ['skulker'], pay: true });
    g.passAll();
    g.expect.zone(skulker.name, 'graveyard', { seat: 0 });
    g.expect.noObject('Squid');
  });
});
