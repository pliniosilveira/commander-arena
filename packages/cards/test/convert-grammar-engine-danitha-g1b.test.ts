// The Danitha deck (issue 26), group 1b (D-1210 to D-1214 provisional): the REAL Oracle text of Cosmic Rebirth, Danitha New Benalia's Light, Spirit Mantle and Season of Growth (the corpus's
// golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is compared with the SYNTHETIC cards of the engine fixtures the engine scenarios of
// `scenario-xx-danitha-g1b.test.ts` run, and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 608.2c and 608.2d
// ("you may", "if you don't"), CR 303.4f (an Aura put onto the battlefield chooses what it enchants), CR 601.2a and 113.6 (a cast from the graveyard once each turn), CR 702.16 (protection
// from a card type), CR 601.2i and 115.1 (a trigger on the cast of a spell that targets a creature you control).
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  getLegalActions,
  syntheticCard,
  validateCard,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
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

const REBIRTH = real('Cosmic Rebirth');
const DANITHA = real("Danitha, New Benalia's Light");
const MANTLE = real('Spirit Mantle');
const SEASON = real('Season of Growth');

const MIGHT_AURA = 'SYNTHETIC Might Aura'; // {1}{G} Aura: enchant creature, +2/+2
const BLADE = 'SYNTHETIC Blade'; // {1} Equipment
const VANILLA = 'SYNTHETIC Vanilla 3/3';
const BEARS = 'Grizzly Bears';
const SPIDER = 'Giant Spider';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

/** Whether the engine lists a cast of the card of that name from the graveyard of seat 0. */
const castable = (g: ScenarioGame, name: string) =>
  getLegalActions(g.state, 0).some((a) => {
    const obj = a.kind === 'castSpell' ? g.state.objects[a.object] : undefined;
    const card = obj?.card == null ? undefined : g.state.cards[obj.card];
    return (
      obj?.zone === 'graveyard' &&
      card !== undefined &&
      g.state.definitions[card.definition]?.name === name
    );
  });

describe('the real cards are the nodes the engine fixtures hold', () => {
  test.each([REBIRTH, DANITHA, MANTLE, SEASON])('%s is valid', (card) => {
    expect(validateCard(card)).toEqual([]);
  });

  test('Cosmic Rebirth: the spell of the SYNTHETIC Rebirth Rite', () => {
    expect(faceOf(REBIRTH).spell).toEqual(faceOf(syntheticCard('SYNTHETIC Rebirth Rite')).spell);
  });

  test('Danitha: the permission of the SYNTHETIC Aura Recaller (and the keywords the card prints)', () => {
    const abilities = faceOf(DANITHA).abilities;
    const keywords = abilities.flatMap((a) => (a.kind === 'keyword' ? [a.keyword.kind] : []));
    expect(keywords).toEqual(['vigilance', 'trample', 'lifelink']);
    expect(abilities.filter((a) => a.kind === 'static')).toEqual(
      faceOf(syntheticCard('SYNTHETIC Aura Recaller')).abilities.filter((a) => a.kind === 'static'),
    );
  });

  test('Spirit Mantle: the abilities of the SYNTHETIC Creature Ward Aura', () => {
    expect(faceOf(MANTLE).abilities).toEqual(
      faceOf(syntheticCard('SYNTHETIC Creature Ward Aura')).abilities,
    );
  });

  test('Season of Growth: the abilities of the SYNTHETIC Growth Watcher', () => {
    expect(faceOf(SEASON).abilities).toEqual(
      faceOf(syntheticCard('SYNTHETIC Growth Watcher')).abilities,
    );
  });
});

describe('Cosmic Rebirth is played', () => {
  const game = (yard: readonly string[], field: readonly string[] = []) =>
    scenario()
      .define(REBIRTH)
      .seat(0)
      .hand(REBIRTH.name)
      .battlefield('Forest', 'Plains', 'Plains', ...field)
      .graveyard(...yard)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a card of mana value 3 or less enters when accepted, and the life is gained', () => {
    const g = game([BEARS]);
    g.act(0).cast(REBIRTH.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.life(0, 43);
  });

  test('declined, the card is put into the hand', () => {
    const g = game([BEARS]);
    g.act(0).cast(REBIRTH.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(BEARS, 'hand', { seat: 0 });
  });

  test('a card of mana value 4 goes into the hand without a question', () => {
    const g = game([SPIDER]);
    g.act(0).cast(REBIRTH.name, { targets: [SPIDER], pay: true });
    g.passAll();
    g.expect.pending('priority', 0);
    g.expect.zone(SPIDER, 'hand', { seat: 0 });
    g.expect.life(0, 43);
  });

  test('an Aura card asks what it enchants and enters attached; with nothing to enchant it goes into the hand', () => {
    const g = game([MIGHT_AURA], [BEARS, VANILLA]);
    g.act(0).cast(REBIRTH.name, { targets: [MIGHT_AURA], pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).choosePermanents(VANILLA);
    g.expect.attached(MIGHT_AURA, VANILLA);
    const h = game([MIGHT_AURA]);
    h.act(0).cast(REBIRTH.name, { targets: [MIGHT_AURA], pay: true });
    h.passAll();
    h.act(0).accept();
    h.expect.zone(MIGHT_AURA, 'hand', { seat: 0 });
    h.expect.invariants();
  });
});

describe("Danitha, New Benalia's Light is played", () => {
  const game = (yard: readonly string[]) =>
    scenario()
      .define(DANITHA)
      .seat(0)
      .battlefield(DANITHA.name, 'Forest', 'Plains', 'Plains', 'Plains', BEARS)
      .graveyard(...yard)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('an Aura or an Equipment is cast from the graveyard once each turn, nothing else is', () => {
    const g = game([MIGHT_AURA, BLADE, SPIDER]);
    expect(castable(g, SPIDER)).toBe(false);
    expect(castable(g, BLADE)).toBe(true);
    g.act(0).cast(MIGHT_AURA, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(MIGHT_AURA, BEARS);
    expect(castable(g, BLADE)).toBe(false);
    g.expect.invariants();
  });
});

describe('Spirit Mantle is played', () => {
  test('enchanted creature has protection from creatures: a creature it blocks deals no damage to it', () => {
    const g = scenario()
      .define(MANTLE)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS)
      .battlefield(MANTLE.name, { attachedTo: BEARS })
      .seat(1)
      .library(...LIBRARY)
      .battlefield(VANILLA)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();
    g.expect.pt(BEARS, 3, 3);
    g.advanceTo('declareAttackers');
    g.act(1).attack(VANILLA);
    g.advanceTo('declareBlockers');
    g.act(0).declareBlockers([{ blocker: BEARS, attacker: VANILLA }]);
    g.passAll();
    g.expect.damage(BEARS, 0);
    g.expect.zone(VANILLA, 'graveyard', { seat: 1 });
  });
});

describe('Season of Growth is played', () => {
  const game = () =>
    scenario()
      .define(SEASON)
      .seat(0)
      .hand(BOLT)
      .battlefield(SEASON.name, 'Mountain', BEARS)
      .library(...LIBRARY)
      .seat(1)
      .battlefield(VANILLA)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('a spell that targets a creature you control draws a card; one that targets an opponent creature does not', () => {
    const g = game();
    g.act(0).cast(BOLT, { targets: [BEARS], pay: true });
    g.passAll();
    expect(g.state.seats[0]?.hand.length).toBe(1);
    const h = game();
    h.act(0).cast(BOLT, { targets: [VANILLA], pay: true });
    h.passAll();
    expect(h.state.seats[0]?.hand.length).toBe(0);
  });
});
