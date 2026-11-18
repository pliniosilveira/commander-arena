// The Grave Danger deck (issue 159): the REAL Oracle text of its cards (the corpus's golden.jsonl, taken from the
// issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played
// through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins: CR 120.2 (Damage), CR 608.2c (an instruction counts as it resolves), CR 603.6a (enters-the-battlefield triggers).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const BEARS = 'Grizzly Bears';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

describe('Lotleth Giant: "When this creature enters, it deals 1 damage to target opponent for each creature card in your graveyard."', () => {
  const giant = real('Lotleth Giant');
  const start = (graveyard: readonly string[]) =>
    scenario()
      .define(giant)
      .seat(0)
      .library(...LIBRARY)
      .hand(giant.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .graveyard(...graveyard)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(giant)).toEqual([]);
  });

  test('two creature cards in the graveyard: two damage, a land card does not count', () => {
    const g = start([BEARS, BEARS, 'Swamp']);
    g.act(0).cast(giant.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(1, 18);
    g.expect.invariants();
  });

  test('an empty graveyard: no damage', () => {
    const g = start([]);
    g.act(0).cast(giant.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(1, 20);
  });
});

describe('Vela the Night-Clad: "Whenever Vela or another creature you control leaves the battlefield, each opponent loses 1 life."', () => {
  const vela = real('Vela the Night-Clad');
  const start = (mine: readonly string[], theirs: readonly string[] = []) =>
    scenario()
      .define(vela)
      .seat(0)
      .library(...LIBRARY)
      .hand('Murder')
      .battlefield(vela.name, 'Swamp', 'Swamp', 'Swamp', ...mine)
      .seat(1)
      .life(20)
      .library(...LIBRARY)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(vela)).toEqual([]);
  });

  test('another creature of yours leaves: each opponent loses 1 life', () => {
    const g = start([BEARS]);
    g.act(0).cast('Murder', { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(1, 19);
    g.expect.invariants();
  });

  test('Vela itself leaves: each opponent loses 1 life (CR 603.6c, it sees itself leave)', () => {
    const g = start([]);
    g.act(0).cast('Murder', { targets: [vela.name], pay: true });
    g.passAll();
    g.passAll();
    g.expect.life(1, 19);
  });

  test('a creature an opponent controls leaves: nothing happens', () => {
    const g = start([], [BEARS]);
    g.act(0).cast('Murder', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.life(1, 20);
    g.expect.stack([]);
  });
});

describe('Liliana\'s Standard Bearer: "When this creature enters, draw X cards, where X is the number of creatures that died under your control this turn."', () => {
  const bearer = real("Liliana's Standard Bearer");
  const start = () =>
    scenario()
      .define(bearer)
      .seat(0)
      .library('Island', 'Swamp', 'Plains', 'Forest', 'Mountain', 'Island', 'Swamp', 'Plains')
      .hand(bearer.name, 'Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(bearer)).toEqual([]);
  });

  test('no creature died: it draws no card', () => {
    const g = start();
    g.act(0).cast(bearer.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.handSize(0, 1);
  });

  test('one creature of mine died this turn: it draws one card (CR 700.4)', () => {
    const g = start();
    g.act(0).cast('Murder', { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).cast(bearer.name, { pay: true });
    g.passAll();
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });
});

describe('Deep Analysis: "Target player draws two cards. Flashback—{1}{U}, Pay 3 life."', () => {
  const analysis = real('Deep Analysis');
  const start = (life: number) =>
    scenario()
      .define(analysis)
      .seat(0)
      .life(life)
      .library('Island', 'Swamp', 'Plains', 'Forest', 'Mountain', 'Island', 'Swamp', 'Plains')
      .graveyard(analysis.name)
      .battlefield('Island', 'Island')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(analysis)).toEqual([]);
  });

  test('flashback pays {1}{U} and 3 life, draws two cards and exiles the card (CR 702.34a)', () => {
    const g = start(20);
    g.act(0).cast(analysis.name, { alternative: 'flashback', targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 17);
    g.expect.handSize(0, 2);
    g.expect.zone(analysis.name, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('with 2 life it cannot be paid (CR 119.4): the flashback is not offered', () => {
    const g = start(2);
    expect(() =>
      g
        .act(0)
        .cast(analysis.name, { alternative: 'flashback', targets: [{ player: 0 }], pay: true }),
    ).toThrow();
  });
});

describe('Unbreathing Horde: "enters with a +1/+1 counter ... for each other Zombie you control and each Zombie card in your graveyard. If this creature would be dealt damage, prevent that damage and remove a +1/+1 counter from it."', () => {
  const horde = real('Unbreathing Horde');
  const ZOMBIE = 'SYNTHETIC Plain Zombie';
  const start = (opts: { battlefield?: readonly string[]; graveyard?: readonly string[] }) =>
    scenario()
      .define(horde)
      .seat(0)
      .library(...LIBRARY)
      .hand(horde.name, 'Lightning Bolt')
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Mountain', ...(opts.battlefield ?? []))
      .graveyard(...(opts.graveyard ?? []))
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(horde)).toEqual([]);
  });

  test('one other Zombie and two Zombie cards in the graveyard: it enters with three counters (CR 614.12)', () => {
    const g = start({ battlefield: [ZOMBIE], graveyard: [ZOMBIE, ZOMBIE, 'Plains'] });
    g.act(0).cast(horde.name, { pay: true });
    g.passAll();
    g.expect.counters(horde.name, { '+1/+1': 3 });
  });

  test('it does not count itself and enters with no counter when nothing counts: it dies as a 0/0', () => {
    const g = start({});
    g.act(0).cast(horde.name, { pay: true });
    g.passAll();
    g.expect.zone(horde.name, 'graveyard', { seat: 0 });
  });

  test('damage to it is prevented and one +1/+1 counter is removed for each damage event (CR 615.6)', () => {
    const g = start({ battlefield: [ZOMBIE], graveyard: [ZOMBIE, ZOMBIE] });
    g.act(0).cast(horde.name, { pay: true });
    g.passAll();
    g.expect.counters(horde.name, { '+1/+1': 3 });
    g.act(0).cast('Lightning Bolt', { targets: [horde.name], pay: true });
    g.passAll();
    g.expect.counters(horde.name, { '+1/+1': 2 });
    g.expect.zone(horde.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Enter the God-Eternals: "deals 4 damage to target creature and you gain life equal to the damage dealt this way. Target player mills four cards. Amass Zombies 4."', () => {
  const spell = real('Enter the God-Eternals');
  const start = (theirs: readonly string[]) =>
    scenario()
      .define(spell)
      .seat(0)
      .life(20)
      .library(...LIBRARY)
      .hand(spell.name)
      .battlefield('Island', 'Island', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(...theirs)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(spell)).toEqual([]);
  });

  test('4 damage to the creature, 4 life, four cards milled and a 4/4 Zombie Army (CR 701.47, 120.3)', () => {
    const g = start([BEARS]);
    g.act(0).cast(spell.name, { targets: [BEARS, { player: 1 }], pay: true });
    g.passAll();
    g.expect.life(0, 24);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    expect(g.find({ name: 'Zombie Army', zone: 'battlefield' })).toHaveLength(1);
    g.expect.counters('Zombie Army', { '+1/+1': 4 });
    g.expect.invariants();
  });
});

describe('Gisa and Geralf: "When this creature enters, mill four cards. Once during each of your turns, you may cast a Zombie creature spell from your graveyard."', () => {
  const gisa = real('Gisa and Geralf');
  const ZOMBIE = 'SYNTHETIC Plain Zombie';
  const OTHER_ZOMBIE = 'SYNTHETIC Zombie Mourner';
  const start = () =>
    scenario()
      .define(gisa)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(gisa.name, 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .graveyard(ZOMBIE, OTHER_ZOMBIE, BEARS)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(gisa)).toEqual([]);
  });

  test('a Zombie creature spell is cast from the graveyard, once each turn (CR 601.2a, 113.6)', () => {
    const g = start();
    g.act(0).cast(ZOMBIE, { pay: true });
    g.passAll();
    expect(g.find({ name: ZOMBIE, zone: 'battlefield' })).toHaveLength(1);
    // The one permission is used: the other Zombie of the graveyard is not offered this turn.
    expect(g.act(0).try.cast(OTHER_ZOMBIE).ok).toBe(false);
    g.expect.invariants();
  });

  test('a creature that is not a Zombie cannot be cast from the graveyard', () => {
    const g = start();
    expect(g.act(0).try.cast(BEARS).ok).toBe(false);
  });
});

describe('Grimoire of the Dead: "{T}, Remove three study counters from this artifact and sacrifice it: Put all creature cards from all graveyards onto the battlefield under your control. They\'re black Zombies in addition to their other colors and types."', () => {
  const grimoire = real('Grimoire of the Dead');
  const MINE = 'Grizzly Bears';
  const start = (counters: number) =>
    scenario()
      .define(grimoire)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(grimoire.name, counters > 0 ? { counters: { study: counters } } : {})
      .graveyard(MINE, 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .graveyard('Llanowar Elves')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(grimoire)).toEqual([]);
  });

  test('three study counters: every creature card of every graveyard comes back under my control as a black Zombie (CR 110.2a, 205.1b, 105.3)', () => {
    const g = start(3);
    g.act(0).activate(grimoire.name, { ability: 1, pay: true });
    g.passAll();
    g.expect.zone(grimoire.name, 'graveyard', { seat: 0 });
    for (const [name, subtypes] of [
      [MINE, ['Bear', 'Zombie']],
      ['Llanowar Elves', ['Elf', 'Druid', 'Zombie']],
    ] as const) {
      expect(g.find({ name, zone: 'battlefield' }), name).toHaveLength(1);
      // Its own green stays and black is added (in addition); the Zombie type is added to the others.
      g.expect.derived({ name, seat: 0 }, { colors: ['B', 'G'], subtypes });
    }
    // The land card stays in the graveyard.
    g.expect.zone('Swamp', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('fewer than three study counters: the ability cannot be activated', () => {
    const g = start(2);
    expect(g.act(0).try.activate(grimoire.name, { ability: 1 }).ok).toBe(false);
  });
});

describe('Necromantic Selection: "Destroy all creatures, then return a creature card put into a graveyard this way to the battlefield under your control. It\'s a black Zombie in addition to its other colors and types. Exile this spell."', () => {
  const selection = real('Necromantic Selection');
  const start = () =>
    scenario()
      .define(selection)
      .seat(0)
      .library(...LIBRARY)
      .hand(selection.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Llanowar Elves')
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(selection)).toEqual([]);
  });

  test("every creature is destroyed, then one of them (any player's) returns under my control as a black Zombie, and the spell is exiled (CR 701.8, 110.2a)", () => {
    const g = start();
    g.act(0).cast(selection.name, { pay: true });
    g.passAll();
    // Both creatures are in graveyards (each in its owner's); the choice among them is mine.
    g.act(0).chooseCards({ name: 'Llanowar Elves', seat: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    // The opponent's card comes back under MY control (CR 110.2a), black in addition to green, and a Zombie.
    expect(g.find({ name: 'Llanowar Elves', zone: 'battlefield' })).toHaveLength(1);
    g.expect.derived({ name: 'Llanowar Elves', seat: 0 }, { colors: ['B', 'G'] });
    g.expect.derived({ name: 'Llanowar Elves', seat: 0 }, { subtypes: ['Druid', 'Elf', 'Zombie'] });
    g.expect.zone(selection.name, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('with no creature destroyed nothing returns and the spell is still exiled', () => {
    const g = scenario()
      .define(selection)
      .seat(0)
      .library(...LIBRARY)
      .hand(selection.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(selection.name, { pay: true });
    g.passAll();
    g.expect.zone(selection.name, 'exile', { seat: 0 });
  });
});
