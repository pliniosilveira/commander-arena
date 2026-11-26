// Squirreled Away deck, group 4: the engine plays what the grammar reads for Sword of the Squeak. The texts are the real wording under SYNTHETIC names.
// Pins: CR 208.4b (base power and toughness), CR 613.4c (layer 7c count), CR 603.2 and 303.4 / 301.5 (an Equipment attached by a trigger), CR 205.3m (creature types).
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const FILLER = ['Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest'] as const;

describe('Sword of the Squeak: "Equipped creature gets +1/+1 for each creature you control with base power or toughness 1." and the attach trigger', () => {
  const BLADE = parsed(
    'SYNTHETIC Squeak Blade',
    'Artifact — Equipment',
    'Equipped creature gets +1/+1 for each creature you control with base power or toughness 1.\nWhenever a Hamster, Mouse, Rat, or Squirrel you control enters, you may attach ~ to that creature.\nEquip {2}',
    { manaCost: '{2}' },
  );
  const MOUSE = parsed('SYNTHETIC Little Mouse', 'Creature — Mouse', '', {
    manaCost: '{G}',
    power: '1',
    toughness: '1',
    colors: ['G'],
  });
  const RAT = parsed('SYNTHETIC Big Rat', 'Creature — Rat', '', {
    manaCost: '{G}',
    power: '3',
    toughness: '1',
    colors: ['G'],
  });
  const OX = parsed('SYNTHETIC Plain Ox', 'Creature — Ox', '', {
    manaCost: '{G}',
    power: '2',
    toughness: '4',
    colors: ['G'],
  });

  const ready = () =>
    scenario()
      .define(BLADE)
      .define(MOUSE)
      .define(RAT)
      .define(OX)
      .seat(0)
      .hand(MOUSE.name, RAT.name, OX.name)
      .battlefield(BLADE.name, 'Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a listed type entering lets the controller attach the Equipment to it, and the count includes it', () => {
    const g = ready();
    g.act(0).cast(MOUSE.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.attached(BLADE.name, { name: MOUSE.name, zone: 'battlefield' });
    // The Mouse is a 1/1 whose base power and toughness are 1: it counts itself.
    g.expect.pt(MOUSE.name, 2, 2);
    g.expect.invariants();
  });

  test('another listed type is attached too, and a base toughness of 1 counts as well as a base power of 1', () => {
    const g = ready();
    g.act(0).cast(MOUSE.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).cast(RAT.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    // The Equipment moved to the 3/1 Rat; the Mouse (1/1) and the Rat (3/1) both count: +2/+2.
    g.expect.attached(BLADE.name, { name: RAT.name, zone: 'battlefield' });
    g.expect.pt(RAT.name, 5, 3);
    g.expect.pt(MOUSE.name, 1, 1);
  });

  test('declining leaves it where it was', () => {
    const g = ready();
    g.act(0).cast(MOUSE.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.attached(BLADE.name, null);
    g.expect.pt(MOUSE.name, 1, 1);
  });

  test('a creature of another type does not trigger it', () => {
    const g = ready();
    g.act(0).cast(OX.name, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.attached(BLADE.name, null);
  });
});

describe('Insatiable Frugivore: "When ~ enters, create a Food token, then you may exile three cards from your graveyard. If you do, repeat this process." (CR 608.2c, 608.2d)', () => {
  const FRUGIVORE = parsed(
    'SYNTHETIC Berry Rat',
    'Creature — Rat Berserker',
    'When ~ enters, create a Food token, then you may exile three cards from your graveyard. If you do, repeat this process.',
    { manaCost: '{3}{B}', power: '2', toughness: '4', colors: ['B'] },
  );
  const YARD = [
    'Grizzly Bears',
    'Raging Goblin',
    'Giant Spider',
    'Serra Angel',
    'Island',
    'Forest',
    'Plains',
  ] as const;

  const ready = (graveyard: readonly string[]) =>
    scenario()
      .define(FRUGIVORE)
      .seat(0)
      .hand(FRUGIVORE.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp')
      .graveyard(...graveyard)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('each time the player exiles three cards another Food is made, and it stops when they decline', () => {
    const g = ready(YARD);
    g.act(0).cast(FRUGIVORE.name, { pay: true });
    g.passAll();
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 1 });
    g.act(0).accept();
    g.act(0).chooseCards('Grizzly Bears', 'Raging Goblin', 'Giant Spider');
    // Process repeated: a second Food, and the offer again (four cards are left).
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 2 });
    g.act(0).decline();
    g.expect.stack([]);
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 2 });
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.zone('Serra Angel', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('it goes on while the player says yes, and ends by itself when fewer than three cards are left (nothing is asked)', () => {
    const g = ready(YARD);
    g.act(0).cast(FRUGIVORE.name, { pay: true });
    g.passAll();
    g.act(0).accept();
    g.act(0).chooseCards('Grizzly Bears', 'Raging Goblin', 'Giant Spider');
    g.act(0).accept();
    g.act(0).chooseCards('Serra Angel', 'Island', 'Forest');
    // One card (Plains) is left: the third Food is made and the offer is not made.
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 3 });
    g.expect.stack([]);
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('declining the first offer leaves the graveyard alone and makes one Food', () => {
    const g = ready(YARD);
    g.act(0).cast(FRUGIVORE.name, { pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 1 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
  });

  test('with fewer than three cards in the graveyard no question is asked: one Food', () => {
    const g = ready(['Grizzly Bears', 'Raging Goblin']);
    g.act(0).cast(FRUGIVORE.name, { pay: true });
    g.passAll();
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 1 });
    g.expect.stack([]);
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.zone('Raging Goblin', 'graveyard', { seat: 0 });
  });
});

describe('Gourmand\'s Talent: "During your turn, artifacts you control are Foods in addition to their other types and have "{2}, {T}, Sacrifice this artifact: You gain 3 life."" (CR 613.1d, 613.1f, 611.3a)', () => {
  const TALENT = parsed(
    'SYNTHETIC Food Talent',
    'Enchantment',
    'During your turn, artifacts you control are Foods in addition to their other types and have "{2}, {T}, Sacrifice this artifact: You gain 3 life."',
    { manaCost: '{G}', colors: ['G'] },
  );
  const GIZMO = parsed('SYNTHETIC Gizmo', 'Artifact', '', { manaCost: '{1}' });

  const game = (active: 0 | 1, own: boolean) =>
    scenario()
      .define(TALENT)
      .define(GIZMO)
      .seat(0)
      .life(20)
      .battlefield(TALENT.name, 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .battlefield(...(own ? [] : [GIZMO.name]))
      .library(...FILLER)
      .at('precombatMain', { active })
      .build();

  const withGizmo = (active: 0 | 1) =>
    scenario()
      .define(TALENT)
      .define(GIZMO)
      .seat(0)
      .life(20)
      .battlefield(TALENT.name, GIZMO.name, 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .at('precombatMain', { active })
      .build();

  test("during its controller's turn an artifact is a Food and can be sacrificed for 3 life", () => {
    const g = withGizmo(0);
    g.expect.derived(GIZMO.name, { types: ['artifact'], subtypes: ['Food'] });
    g.act(0).activate(GIZMO.name, { pay: true });
    g.passAll();
    g.expect.life(0, 23);
    g.expect.zone(GIZMO.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test("during another player's turn it is neither a Food nor given the ability", () => {
    const g = withGizmo(1);
    g.expect.derived(GIZMO.name, { types: ['artifact'], subtypes: [] });
    expect(
      g.legalActions(0).some((a) => a.kind === 'activate' && a.object === g.id(GIZMO.name)),
    ).toBe(false);
  });

  test("only artifacts the Talent's controller controls", () => {
    const g = game(0, false);
    g.expect.derived(GIZMO.name, { subtypes: [] });
  });

  test('a group keyword "during your turn" follows the turn too (CR 611.3a, 613.1f)', () => {
    const LORD = parsed(
      'SYNTHETIC Day Lord',
      'Enchantment',
      'During your turn, creatures you control have flying.',
      { manaCost: '{G}', colors: ['G'] },
    );
    const build = (active: 0 | 1) =>
      scenario()
        .define(LORD)
        .seat(0)
        .battlefield(LORD.name, 'Grizzly Bears')
        .library(...FILLER)
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active })
        .build();
    build(0).expect.derived('Grizzly Bears', { keywords: ['flying'] });
    build(1).expect.derived('Grizzly Bears', { keywords: [] });
  });
});

describe('Hazel\'s Brewmaster: "Foods you control have all activated abilities of all creature cards exiled with ~." (CR 613.1f, 607.2a, 113.6)', () => {
  const BREWMASTER = parsed(
    'SYNTHETIC Brew Squirrel',
    'Creature — Squirrel Warlock',
    'Menace\nWhenever this creature enters or attacks, exile up to one target card from a graveyard and create a Food token.\nFoods you control have all activated abilities of all creature cards exiled with this creature.',
    { manaCost: '{3}{B}', power: '3', toughness: '4', colors: ['B'] },
  );
  const SIPPER = parsed('SYNTHETIC Life Sipper', 'Creature — Elf', '{1}: You gain 1 life.', {
    manaCost: '{G}',
    power: '1',
    toughness: '1',
    colors: ['G'],
  });
  const ZAP = parsed('SYNTHETIC Quick Zap', 'Instant', 'Draw a card.', {
    manaCost: '{U}',
    colors: ['U'],
  });

  const game = (graveyard: readonly string[]) =>
    scenario()
      .define(BREWMASTER)
      .define(SIPPER)
      .define(ZAP)
      .seat(0)
      .life(20)
      .hand(BREWMASTER.name)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .graveyard(...graveyard)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('a Food has the activated abilities of the creature cards exiled with it, treated as its own', () => {
    const g = game([SIPPER.name]);
    g.act(0).cast(BREWMASTER.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: SIPPER.name, zone: 'graveyard' });
    g.passAll();
    g.expect.zone(SIPPER.name, 'exile', { seat: 1 });
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 1 });
    // The Food's own ability is the first; the one of the exiled creature card is the second.
    g.act(0).activate('Food', { ability: 1, pay: true });
    g.passAll();
    g.expect.life(0, 21);
    g.expect.zone('Food', 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('the abilities of a card that is not a creature card are not given', () => {
    const g = game([ZAP.name]);
    g.act(0).cast(BREWMASTER.name, { pay: true });
    g.passAll();
    g.act(0).chooseTargets({ name: ZAP.name, zone: 'graveyard' });
    g.passAll();
    g.expect.zone(ZAP.name, 'exile', { seat: 1 });
    // Only the Food's own ability (index 0): nothing was given by an instant card.
    const food = g.id('Food');
    const activations = g.legalActions(0).filter((a) => a.kind === 'activate' && a.object === food);
    expect(activations.some((a) => a.kind === 'activate' && a.abilityIndex > 0)).toBe(false);
  });
});

describe('Garruk, Cursed Huntsman: the Wolves\' "When this token dies, put a loyalty counter on each Garruk you control." (CR 111.4, 205.3j, 122.1)', () => {
  const TEXT =
    '0: Create two 2/2 black and green Wolf creature tokens with "When this token dies, put a loyalty counter on each Garruk you control."\n\u22123: Destroy target creature. Draw a card.';
  const A = parsed('Garruk, SYNTHETIC Huntsman', 'Legendary Planeswalker \u2014 Garruk', TEXT, {
    manaCost: '{4}{B}{G}',
    colors: ['B', 'G'],
    loyalty: '5',
  });
  const B = parsed('Garruk, SYNTHETIC Hunter', 'Legendary Planeswalker \u2014 Garruk', TEXT, {
    manaCost: '{4}{B}{G}',
    colors: ['B', 'G'],
    loyalty: '5',
  });

  test("the card parses and the token's ability names the planeswalker type, not the card", () => {
    expect(A.faces[0]?.abilities.length).toBe(2);
    const wolf = JSON.stringify(A.faces[0]?.abilities[0]);
    expect(wolf).toContain('"subtypes":["Garruk"]');
    expect(wolf).toContain('"controller":"you"');
  });

  test('when a Wolf dies every Garruk its controller controls gets a loyalty counter, and no other', () => {
    const rival = parsed('Garruk, SYNTHETIC Rival', 'Legendary Planeswalker \u2014 Garruk', TEXT, {
      manaCost: '{4}{B}{G}',
      colors: ['B', 'G'],
      loyalty: '5',
    });
    const g = scenario()
      .define(A)
      .define(B)
      .define(rival)
      .seat(0)
      .battlefield(A.name, { counters: { loyalty: 5 } })
      .battlefield(B.name, { counters: { loyalty: 4 } })
      .library(...FILLER)
      .seat(1)
      .battlefield(rival.name, { counters: { loyalty: 3 } })
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(A.name, { ability: 0 });
    g.passAll();
    g.expect.zone('Wolf', 'battlefield', { seat: 0, count: 2 });
    g.expect.counters(A.name, { loyalty: 5 });
    // The other Garruk kills a Wolf (the one that is not the first).
    g.act(0).activate(B.name, {
      ability: 1,
      targets: [{ name: 'Wolf', zone: 'battlefield', nth: 0 }],
    });
    g.passAll();
    g.expect.zone('Wolf', 'battlefield', { seat: 0, count: 1 });
    // B paid 3 (4 to 1) and got one back; A got one; the rival's Garruk is not "you control".
    g.expect.counters(A.name, { loyalty: 6 });
    g.expect.counters(B.name, { loyalty: 2 });
    g.expect.counters(rival.name, { loyalty: 3 });
    g.expect.invariants();
  });
});
