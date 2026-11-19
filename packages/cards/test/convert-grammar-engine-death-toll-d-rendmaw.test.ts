// Death Toll deck, group D: "When ~ enters and whenever you play a card with two or more card types, each player creates a tapped 2/2 black Bird creature token with flying. The tokens are
// goaded for the rest of the game." (CR 603.2, 305.1, 601.2, 205.2a, 111.2, 701.15a, 701.15b). The wording is that of Rendmaw, Creaking Nest; every card name starts with "SYNTHETIC". Rulings
// 2024-09-20: the card types are artifact, battle, creature, enchantment, instant, kindred, land, planeswalker and sorcery; being goaded is not an ability and lasts as long as the effect does.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Island', 'Plains', 'Swamp'] as const;

const rendmaw = parsed(
  'SYNTHETIC Parsed Rendmaw',
  'Legendary Artifact Creature — Scarecrow',
  'Reach, menace\nWhen ~ enters and whenever you play a card with two or more card types, each player creates a tapped 2/2 black Bird creature token with flying. The tokens are goaded for the rest of the game.',
  { manaCost: '{B}', power: '5', toughness: '5', colors: ['B'] },
);
const golem = parsed('SYNTHETIC Parsed Golem', 'Artifact Creature — Golem', 'Vigilance', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const bear = parsed('SYNTHETIC Parsed Bear', 'Creature — Bear', 'Vigilance', {
  manaCost: '{1}',
  power: '2',
  toughness: '2',
});
const grove = parsed('SYNTHETIC Parsed Grove', 'Artifact Land', '{T}: Add {C}.');
const hollow = parsed('SYNTHETIC Parsed Hollow', 'Land', '{T}: Add {C}.');
const dryad = parsed('SYNTHETIC Parsed Dryad', 'Creature Land', '~ enters tapped.\n{T}: Add {C}.', {
  power: '1',
  toughness: '1',
});
const trinket = parsed('SYNTHETIC Parsed Trinket', 'Artifact', 'Flash', { manaCost: '{1}' });

const defs = () =>
  scenario()
    .define(rendmaw)
    .define(golem)
    .define(bear)
    .define(grove)
    .define(hollow)
    .define(dryad)
    .define(trinket);

const goaded = (g: ReturnType<ReturnType<typeof defs>['build']>) =>
  g.state.continuousEffects.filter((e) => e.change.kind === 'goaded');

const board = () =>
  defs()
    .seat(0)
    .library(...FILLER)
    .hand(golem.name)
    .hand(bear.name)
    .hand(grove.name)
    .hand(hollow.name)
    .hand(dryad.name)
    .hand(trinket.name)
    .battlefield(rendmaw.name)
    .battlefield('Swamp', { count: 5 })
    .seat(1)
    .library(...FILLER)
    .at('precombatMain', { active: 0 })
    .build();

describe('"whenever you play a card with two or more card types": a spell cast or a land played (CR 305.1, 601.2)', () => {
  test('an artifact creature spell cast: each player creates a tapped 2/2 black Bird with flying', () => {
    const g = board();
    g.act(0).cast(golem.name, { pay: true });
    g.passAll();
    g.expect.zone('Bird', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Bird', 'battlefield', { seat: 1, count: 1 });
    g.expect.tapped({ name: 'Bird', zone: 'battlefield', seat: 0 }, true);
    g.expect.tapped({ name: 'Bird', zone: 'battlefield', seat: 1 }, true);
    g.expect.pt({ name: 'Bird', zone: 'battlefield', seat: 1 }, 2, 2);
    g.expect.derived({ name: 'Bird', zone: 'battlefield', seat: 1 }, { keywords: ['flying'] });
    g.expect.invariants();
  });

  test('a creature spell with one card type does nothing', () => {
    const g = board();
    g.act(0).cast(bear.name, { pay: true });
    g.passAll();
    g.expect.noObject('Bird', { zone: 'battlefield' });
  });

  test('a land with two card types played (an artifact land): the trigger sees it as the land is played', () => {
    const g = board();
    g.act(0).playLand(grove.name);
    g.passAll();
    g.expect.zone('Bird', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Bird', 'battlefield', { seat: 1, count: 1 });
  });

  test('a land with one card type played does nothing', () => {
    const g = board();
    g.act(0).playLand(hollow.name);
    g.passAll();
    g.expect.noObject('Bird', { zone: 'battlefield' });
  });

  test('a creature land (two card types) played: the Birds come', () => {
    const g = board();
    g.act(0).playLand(dryad.name);
    g.passAll();
    g.expect.zone('Bird', 'battlefield', { seat: 1, count: 1 });
  });

  test('a noncreature artifact has one card type: nothing', () => {
    const g = board();
    g.act(0).cast(trinket.name, { pay: true });
    g.passAll();
    g.expect.noObject('Bird', { zone: 'battlefield' });
  });

  test('a card an opponent plays is not "you play"', () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .battlefield(rendmaw.name)
      .seat(1)
      .library(...FILLER)
      .hand(golem.name)
      .battlefield('Swamp', { count: 2 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(golem.name, { pay: true });
    g.passAll();
    g.expect.noObject('Bird', { zone: 'battlefield' });
  });
});

describe('"When ~ enters": the same tokens, goaded for the rest of the game (CR 701.15a, 701.15b)', () => {
  const entering = () => {
    const g = defs()
      .seat(0)
      .library(...FILLER)
      .hand(rendmaw.name)
      .battlefield('Swamp')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(rendmaw.name, { pay: true });
    g.passAll();
    return g;
  };

  test('entering makes a Bird for each player', () => {
    const g = entering();
    g.expect.zone('Bird', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Bird', 'battlefield', { seat: 1, count: 1 });
  });

  test('both Birds are goaded by the controller of the ability, with no end (the rest of the game)', () => {
    const g = entering();
    const effects = goaded(g);
    expect(effects).toHaveLength(2);
    for (const e of effects) {
      expect(e.change).toMatchObject({ kind: 'goaded', by: 0 });
      expect(e.until).toBe('permanent');
    }
  });

  test('the goad is still there after several turns', () => {
    const g = entering();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(goaded(g)).toHaveLength(2);
  });

  test('a goaded Bird of the opponent must attack on its controller turn', () => {
    const g = entering();
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    const none = g.act(1).try.declareAttackers([]);
    expect(none.ok).toBe(false);
  });
});
