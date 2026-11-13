// The Hashaton deck (issue 31), group 8 (provisional D-1140 to D-1144): the REAL Oracle text of Victimize and Vohar, Vodalian Desecrator (the corpus's golden.jsonl, taken from
// the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the
// real text are what the engine runs. The helper cards are real fixtures. Pins: CR 115.1 and 601.2c (two targets), CR 608.2b (a target that is gone), CR 608.2c ("if you do",
// "this way"), CR 701.21a (the creature sacrificed is chosen by its controller), CR 701.9 and 121.1 (draw, then discard), CR 601.2 and 611.2a (a cast permission for the turn),
// CR 614.1a (exile instead of the graveyard), CR 602.5d (activate only as a sorcery).
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

const FILLER = Array.from({ length: 12 }, () => 'Plains');
const BEARS = 'Grizzly Bears';
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const ELVES = 'Llanowar Elves';
const BOLT = 'Lightning Bolt'; // {R} instant, 3 damage to any target
const DIVINATION = 'Divination'; // {2}{U} sorcery, draw two
const COUNTERSPELL = 'Counterspell'; // {U}{U} instant

describe('Victimize: "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped."', () => {
  const victimize = real('Victimize');
  const VICTIMIZE = victimize.name;

  const start = (battlefield: readonly string[], graveyard: readonly string[]) =>
    scenario()
      .define(victimize)
      .seat(0)
      .hand(VICTIMIZE)
      .battlefield('Swamp', { count: 3 })
      .battlefield(...battlefield)
      .graveyard(...graveyard)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(victimize)).toEqual([]);
  });

  test('two cards return tapped after a creature is sacrificed (the only one is taken without a question)', () => {
    const g = start([ELVES], [BEARS, ZOMBIE]);
    g.act(0).cast(VICTIMIZE, { targets: [BEARS, ZOMBIE], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ZOMBIE, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, true);
    g.expect.tapped(ZOMBIE, true);
    g.expect.zone(VICTIMIZE, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('with several creatures the player chooses which to sacrifice, and it may be a card that was not chosen', () => {
    const g = start([ELVES, 'SYNTHETIC Quiet Cub'], [BEARS, ZOMBIE]);
    g.act(0).cast(VICTIMIZE, { targets: [BEARS, ZOMBIE], pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('SYNTHETIC Quiet Cub');
    g.expect.zone('SYNTHETIC Quiet Cub', 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ZOMBIE, 'battlefield', { seat: 0 });
  });

  test('with no creature to sacrifice nothing returns', () => {
    const g = start([], [BEARS, ZOMBIE]);
    g.act(0).cast(VICTIMIZE, { targets: [BEARS, ZOMBIE], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ZOMBIE, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('one of the two cards gone in response: the other returns (CR 608.2b)', () => {
    const g = scenario()
      .define(victimize)
      .seat(0)
      .hand(VICTIMIZE)
      .battlefield('Swamp', { count: 3 })
      .battlefield(ELVES)
      .graveyard(BEARS, ZOMBIE)
      .library(...FILLER)
      .seat(1)
      .hand('SYNTHETIC Grave Scour')
      .battlefield('Swamp')
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(VICTIMIZE, { targets: [BEARS, ZOMBIE], pay: true });
    g.act(0).pass();
    g.act(1).cast('SYNTHETIC Grave Scour', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(ZOMBIE, 'battlefield', { seat: 0 });
    g.expect.tapped(ZOMBIE, true);
    g.expect.zone(BEARS, 'exile');
  });

  test('the engine takes only two cards: one card alone cannot be targeted', () => {
    const g = start([ELVES], [BEARS]);
    expect(() => g.act(0).cast(VICTIMIZE, { targets: [BEARS], pay: true })).toThrow();
  });
});

describe('Vohar, Vodalian Desecrator', () => {
  const vohar = real('Vohar, Vodalian Desecrator');
  const VOHAR = vohar.name;

  const start = (hand: readonly string[], graveyard: readonly string[], library = FILLER) =>
    scenario()
      .define(vohar)
      .seat(0)
      .life(20)
      .battlefield(VOHAR)
      .battlefield('Mountain', { count: 3 })
      .battlefield('Island', { count: 3 })
      .hand(...hand)
      .graveyard(...graveyard)
      .library(...library)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(vohar)).toEqual([]);
  });

  describe('"{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card this way, each opponent loses 1 life and you gain 1 life."', () => {
    test('discarding an instant: the drain', () => {
      const g = start([BOLT], []);
      g.act(0).activate(VOHAR, { ability: 0 });
      g.passAll();
      g.act(0).chooseCards(BOLT);
      g.expect.life(0, 21);
      g.expect.life(1, 19);
      g.expect.invariants();
    });

    test('discarding a sorcery: the drain', () => {
      const g = start([DIVINATION], []);
      g.act(0).activate(VOHAR, { ability: 0 });
      g.passAll();
      g.act(0).chooseCards(DIVINATION);
      g.expect.life(0, 21);
      g.expect.life(1, 19);
    });

    test('discarding a creature or a land: no drain', () => {
      for (const card of [BEARS, 'Island']) {
        const g = start([card], []);
        g.act(0).activate(VOHAR, { ability: 0 });
        g.passAll();
        g.act(0).chooseCards(card);
        g.expect.life(0, 20);
        g.expect.life(1, 20);
      }
    });

    test('the drawn card may be the one discarded', () => {
      const g = start([], [], [BOLT, ...FILLER]);
      g.act(0).activate(VOHAR, { ability: 0 });
      g.passAll();
      if (g.state.pending?.kind === 'chooseCards') g.act(0).chooseCards(BOLT);
      g.expect.zone(BOLT, 'graveyard', { seat: 0 });
      g.expect.life(1, 19);
    });
  });

  describe('"{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead. Activate only as a sorcery."', () => {
    test('the spell is cast from the graveyard, paid for, and exiled after it resolves', () => {
      const g = start([], [BOLT]);
      g.act(0).activate(VOHAR, { ability: 1, targets: [BOLT], pay: true });
      g.expect.zone(VOHAR, 'graveyard', { seat: 0 });
      g.passAll();
      g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
      g.passAll();
      g.expect.life(1, 17);
      g.expect.zone(BOLT, 'exile');
      g.expect.noObject(BOLT, { zone: 'graveyard' });
      g.expect.invariants();
    });

    test('a countered spell is exiled too', () => {
      const g = scenario()
        .define(vohar)
        .seat(0)
        .battlefield(VOHAR)
        .battlefield('Mountain', { count: 3 })
        .graveyard(BOLT)
        .library(...FILLER)
        .seat(1)
        .life(20)
        .hand(COUNTERSPELL)
        .battlefield('Island', { count: 2 })
        .library(...FILLER)
        .at('precombatMain', { active: 0, turn: 3 })
        .build();
      g.act(0).activate(VOHAR, { ability: 1, targets: [BOLT], pay: true });
      g.passAll();
      g.act(0).cast(BOLT, { targets: [{ player: 1 }], pay: true });
      g.act(0).pass();
      g.act(1).cast(COUNTERSPELL, { targets: [{ name: BOLT, zone: 'stack' }], pay: true });
      g.passAll();
      g.expect.life(1, 20);
      g.expect.zone(BOLT, 'exile');
    });

    test('not in combat: "Activate only as a sorcery"', () => {
      const g = start([], [BOLT]);
      g.advanceTo('beginningOfCombat');
      expect(() => g.act(0).activate(VOHAR, { ability: 1, targets: [BOLT], pay: true })).toThrow();
    });

    test('an unspent permission does nothing at the end of the turn: the card stays in the graveyard', () => {
      const g = start([], [BOLT]);
      g.act(0).activate(VOHAR, { ability: 1, targets: [BOLT], pay: true });
      g.passAll();
      g.advanceTo('upkeep', { turn: 'next' });
      g.advanceTo('upkeep', { turn: 'next' });
      g.expect.zone(BOLT, 'graveyard', { seat: 0 });
      expect(g.state.continuousEffects.filter((e) => e.change.kind === 'castPermission')).toEqual(
        [],
      );
    });
  });
});

describe('texts near the ones above are never half read', () => {
  const unsupported = (name: string, text: string, type: string, subtypes: string[] = []) => {
    const card = GOLDEN.find((c) => c.name === name);
    if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
    const face = card.faces[0];
    if (face === undefined) throw new Error('no face');
    const imported = importCard(
      fromGoldenCard({
        ...card,
        faces: [
          {
            ...face,
            oracleText: text,
            typeLine: `${type}${subtypes.length > 0 ? ` — ${subtypes.join(' ')}` : ''}`,
          },
        ],
      }),
      undefined,
      NO_OVERRIDES,
    );
    return imported.support.status;
  };

  test('a discard-this-way condition with no discard before it is not a card the engine takes', () => {
    expect(
      unsupported(
        'Vohar, Vodalian Desecrator',
        '{T}: Draw a card. If you discarded an instant or sorcery card this way, each opponent loses 1 life and you gain 1 life.',
        'Creature',
        ['Wizard'],
      ),
    ).toBe('unsupported');
  });

  test('a sentence that only names the targets has nothing to do', () => {
    expect(
      unsupported('Victimize', 'Choose two target creature cards in your graveyard.', 'Sorcery'),
    ).toBe('unsupported');
  });
});
