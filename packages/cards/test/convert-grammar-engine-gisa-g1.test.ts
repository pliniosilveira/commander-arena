// The Gisa deck (issue 41), group 1 (D-472 to D-476): the REAL Oracle text of Lost Monarch of Ifnir, Zombie Master, Zombie Trailblazer and Dreadhorde Invasion (the corpus's
// golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is compared with the SYNTHETIC cards of the engine fixtures the engine scenarios of
// `scenario-xx-gisa-g1-*.test.ts` run, and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 702.130a and 702.130b
// (afflict), CR 702.14c (swampwalk), CR 305.7 (a land becomes a Swamp), CR 118.3 and 302.6 (the cost that taps an untapped Zombie), CR 603.4 and 120.2a (the intervening "if" that
// reads the combat damage of the turn), CR 603.2 (the attack trigger with a power filter on a token) and CR 702.15 (lifelink).
import { readFileSync } from 'node:fs';
import { type CardDefinition, syntheticCard, validateCard } from '@commander-arena/engine';
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

const MONARCH = real('Lost Monarch of Ifnir');
const MASTER = real('Zombie Master');
const SCOUT = real('Zombie Trailblazer');
const BANNER = real('Dreadhorde Invasion');

const ZOMBIE = 'SYNTHETIC Gisa Zombie';
const BEARS = 'Grizzly Bears';
const LIBRARY = [BEARS, 'Island', 'Island', 'Giant Spider', 'Island', 'Island', 'Island'] as const;

const abilitiesOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face.abilities;
};

describe('the real cards are the nodes the engine fixtures hold', () => {
  test.each([MONARCH, MASTER, SCOUT, BANNER])('%s is valid', (card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Lost Monarch of Ifnir: the abilities of the SYNTHETIC Afflict Monarch', () => {
    expect(abilitiesOf(MONARCH)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Afflict Monarch')));
  });

  test('Zombie Master: the abilities of the SYNTHETIC Walk Master (swampwalk and the regeneration it gives)', () => {
    expect(abilitiesOf(MASTER)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Walk Master')));
  });

  test('Zombie Trailblazer: the abilities of the SYNTHETIC Trail Scout', () => {
    expect(abilitiesOf(SCOUT)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Trail Scout')));
  });

  test('Dreadhorde Invasion: the abilities of the SYNTHETIC Horde Banner', () => {
    expect(abilitiesOf(BANNER)).toEqual(abilitiesOf(syntheticCard('SYNTHETIC Horde Banner')));
  });
});

const game = (build: (b: ReturnType<typeof scenario>) => void) => {
  const b = scenario();
  build(b);
  return b.build();
};

describe('Lost Monarch of Ifnir is played', () => {
  test('an attacker with afflict 3 that is blocked costs the defender 3 life; a Zombie it gives afflict to does too', () => {
    const g = game((b) => {
      b.define(MONARCH)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(MONARCH.name, ZOMBIE)
        .seat(1)
        .library(...LIBRARY)
        .battlefield(BEARS, BEARS);
    });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([MONARCH.name, ZOMBIE]);
    g.advanceTo('declareBlockers', { block: false });
    g.act(1).declareBlockers([
      { blocker: 'Grizzly Bears[0]', attacker: MONARCH.name },
      { blocker: 'Grizzly Bears[1]', attacker: ZOMBIE },
    ]);
    // Two triggers of different sources: the controller orders them (CR 603.3b).
    expect(g.state.pending?.kind).toBe('orderTriggers');
    g.act(0).orderTriggers(MONARCH.name, ZOMBIE);
    expect(g.state.stack).toHaveLength(2);
    g.passAll();
    g.expect.life(1, 34);
  });

  test('a Zombie deals combat damage: at the second main phase the library is milled by three and a creature card may come back', () => {
    const g = game((b) => {
      b.define(MONARCH)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(MONARCH.name, ZOMBIE)
        .seat(1)
        .library(...LIBRARY);
    });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([ZOMBIE]);
    g.advanceTo('postcombatMain');
    g.expect.stack([`${MONARCH.name} (ability)`]);
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.act(0).chooseCards({ name: BEARS, zone: 'graveyard' });
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('no Zombie dealt combat damage: no trigger', () => {
    const g = game((b) => {
      b.define(MONARCH)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(MONARCH.name, BEARS)
        .seat(1)
        .library(...LIBRARY);
    });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([BEARS]);
    g.advanceTo('postcombatMain');
    expect(g.state.stack).toHaveLength(0);
  });
});

describe('Zombie Master is played', () => {
  test('another Zombie is unblockable while the defender controls a Swamp, the Master is not', () => {
    const board = (land: string) => {
      const g = game((b) => {
        b.define(MASTER)
          .seat(0)
          .library(...LIBRARY)
          .battlefield(MASTER.name, ZOMBIE)
          .seat(1)
          .library(...LIBRARY)
          .battlefield(land, BEARS);
      });
      g.advanceTo('declareAttackers', { attack: false });
      g.act(0).attack([MASTER.name, ZOMBIE]);
      g.advanceTo('declareBlockers', { block: false });
      return g;
    };
    const swamp = board('Swamp');
    expect(swamp.act(1).try.declareBlockers([{ blocker: BEARS, attacker: ZOMBIE }]).ok).toBe(false);
    expect(swamp.act(1).try.declareBlockers([{ blocker: BEARS, attacker: MASTER.name }]).ok).toBe(
      true,
    );
    const forest = board('Forest');
    expect(forest.act(1).try.declareBlockers([{ blocker: BEARS, attacker: ZOMBIE }]).ok).toBe(true);
  });

  test('the other Zombies have "{B}: Regenerate this permanent."', () => {
    const g = game((b) => {
      b.define(MASTER)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(MASTER.name, ZOMBIE, 'Swamp')
        .seat(1)
        .library(...LIBRARY);
    });
    const legal = g.legalActions(0).filter((a) => a.kind === 'activate');
    expect(legal.some((a) => a.kind === 'activate' && a.object === g.id(ZOMBIE))).toBe(true);
    expect(legal.some((a) => a.kind === 'activate' && a.object === g.id(MASTER.name))).toBe(false);
  });
});

describe('Zombie Trailblazer is played', () => {
  const board = (extra: readonly string[] = []) =>
    game((b) => {
      b.define(SCOUT)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(SCOUT.name, ZOMBIE, 'Forest', BEARS, ...extra)
        .seat(1)
        .library(...LIBRARY)
        .battlefield('Mountain');
    });

  test('tap an untapped Zombie: a Forest becomes a Swamp, with the ability of a Swamp', () => {
    const g = board();
    g.act(0).activate(SCOUT.name, { ability: 0, targets: ['Forest'] });
    g.act(0).choosePermanents(ZOMBIE);
    g.expect.tapped(ZOMBIE, true);
    g.passAll();
    g.act(0).tapForMana('Forest');
    g.expect.pool(0, 'B');
  });

  test('tap an untapped Zombie: a creature gains swampwalk and can not be blocked by a player with a Swamp', () => {
    const g = game((b) => {
      b.define(SCOUT)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(SCOUT.name, ZOMBIE, BEARS)
        .seat(1)
        .library(...LIBRARY)
        .battlefield('Swamp', 'Giant Spider');
    });
    g.act(0).activate(SCOUT.name, {
      ability: 1,
      targets: [{ name: BEARS, seat: 0, zone: 'battlefield' }],
    });
    g.act(0).choosePermanents(ZOMBIE);
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([{ name: BEARS, seat: 0, zone: 'battlefield' }]);
    g.advanceTo('declareBlockers', { block: false });
    expect(
      g
        .act(1)
        .try.declareBlockers([
          { blocker: 'Giant Spider', attacker: { name: BEARS, seat: 0, zone: 'battlefield' } },
        ]).ok,
    ).toBe(false);
  });
});

describe('Dreadhorde Invasion is played', () => {
  test('upkeep: lose 1 life and amass Zombies 1 (the lines that were read before)', () => {
    const g = game((b) => {
      b.define(BANNER)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(BANNER.name)
        .seat(1)
        .library(...LIBRARY);
    });
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.expect.life(0, 39);
    const tokens = g.state.battlefield.filter((id) => g.state.objects[id]?.token != null);
    expect(tokens).toHaveLength(1);
  });

  test('a Zombie that is not a token does not trigger it', () => {
    const g = game((b) => {
      b.define(BANNER)
        .seat(0)
        .library(...LIBRARY)
        .battlefield(BANNER.name, ZOMBIE)
        .seat(1)
        .library(...LIBRARY);
    });
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack([ZOMBIE]);
    expect(g.state.stack).toHaveLength(0);
  });
});
