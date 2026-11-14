// The Danitha deck (issue 26), group 3 (D-1230 to D-1236 provisional): the REAL Oracle text of Kor Spiritdancer, Sage's Reverie, Winds of Rath, Ethereal Armor, Face of Divinity,
// Shield of the Oversoul, Shardmage's Rescue and Strong Back (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an
// engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. The abilities are also compared with the SYNTHETIC
// cards of `synthetic-danitha-g3.ts`, which the engine's own tests play. Pins: CR 303.4 and 301.5 (attachments; "enchanted" is having an Aura attached), CR 611.3a and 613.8 (a
// static ability follows the board and reads the host through layers 1, 4 and 5), CR 701.19c (it can't be regenerated), CR 400.7 (the Aura that entered this turn), CR 608.2b (a spell
// whose target became illegal does not resolve), CR 601.2c, 601.2f and 602.2b (targets, then the total cost; a reduction that depends on the targets), CR 702.6a (Equip), CR 118.7.
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

const BEARS = 'Grizzly Bears'; // 2/2 green
const ANGEL = 'Serra Angel'; // 4/4 white flying, vigilance
const VANILLA = 'SYNTHETIC Vanilla 3/3'; // 3/3 colorless
const RECALLER = 'SYNTHETIC Aura Recaller'; // 2/2 green and white
const MIGHT = 'SYNTHETIC Might Aura'; // {1}{G} Aura +2/+2
const WINGS = 'SYNTHETIC Wings Aura'; // {1}{U} Aura: flying
const BLADE = 'SYNTHETIC Blade'; // Equipment +2/+0, Equip {1}
const COSTLY = 'SYNTHETIC Costly Blade'; // Equipment +1/+1, Equip {4}
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

/** Whether the two cards have the same abilities (and, for a spell, the same text), compared as data. */
function sameAs(card: CardDefinition, synthetic: string): void {
  const mine = card.faces[0];
  const theirs = syntheticCard(synthetic).faces[0];
  expect(mine?.abilities).toEqual(theirs?.abilities);
  expect(mine?.spell).toEqual(theirs?.spell);
}

describe('Kor Spiritdancer: "This creature gets +2/+2 for each Aura attached to it. Whenever you cast an Aura spell, you may draw a card."', () => {
  const dancer = real('Kor Spiritdancer');
  const DANCER = dancer.name;

  test('the card is valid and its AST is the SYNTHETIC one the engine tests play', () => {
    expect(validateCard(dancer)).toEqual([]);
    sameAs(dancer, 'SYNTHETIC Aura Weaver');
  });

  test('0/2 alone, and +2/+2 for each Aura attached to it (an Aura on another creature, or an Equipment, does not count)', () => {
    const g = scenario()
      .define(dancer)
      .seat(0)
      .battlefield(DANCER, BEARS, BLADE)
      .battlefield(MIGHT, { attachedTo: DANCER })
      .battlefield(WINGS, { attachedTo: BEARS })
      .battlefield(BLADE, { attachedTo: DANCER })
      .seat(1)
      .build();
    g.expect.pt(DANCER, 6, 6); // 0/2, Might +2/+2, one Aura +2/+2, the Blade +2/+0
    g.expect.pt(BEARS, 2, 2);
    g.expect.invariants();
  });

  test('an Aura spell lets its controller draw a card, a spell that is not an Aura does not', () => {
    const g = scenario()
      .define(dancer)
      .seat(0)
      .hand(MIGHT)
      .battlefield(DANCER, 'Forest', 'Forest')
      .library(...LIBRARY)
      .seat(1)
      .build();
    g.act(0).cast(MIGHT, { targets: [DANCER], pay: true });
    g.passAll();
    g.act(0).accept();
    g.expect.handSize(0, 1);
    g.passAll();
    g.expect.pt(DANCER, 4, 6);
  });
});

describe("Sage's Reverie: draws and gives +1/+1 for each Aura you control that's attached to a creature", () => {
  const reverie = real("Sage's Reverie");
  const REVERIE = reverie.name;
  const build = () =>
    scenario()
      .define(reverie)
      .seat(0)
      .hand(REVERIE)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS, VANILLA)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .battlefield(WINGS, { attachedTo: VANILLA })
      .library(...LIBRARY)
      .seat(1)
      .battlefield(ANGEL)
      .battlefield(MIGHT, { attachedTo: ANGEL })
      .build();

  test('the card is valid and its AST is the SYNTHETIC one the engine tests play', () => {
    expect(validateCard(reverie)).toEqual([]);
    sameAs(reverie, 'SYNTHETIC Aura Scholar');
  });

  test('entering draws one card for each Aura of yours on a creature (itself included, an opponent Aura not)', () => {
    const g = build();
    g.act(0).cast(REVERIE, { targets: [BEARS], pay: true });
    g.passAll();
    g.passAll();
    g.expect.handSize(0, 3); // Might, Wings and the Reverie
    g.expect.pt(BEARS, 2 + 2 + 3, 2 + 2 + 3);
    g.expect.pt(ANGEL, 4 + 2, 4 + 2);
    g.expect.invariants();
  });
});

describe('Winds of Rath: "Destroy all creatures that aren\'t enchanted. They can\'t be regenerated."', () => {
  const winds = real('Winds of Rath');
  const WINDS = winds.name;
  const TROLL = 'SYNTHETIC Regenerating Troll';
  const CHARM = 'SYNTHETIC Regrowth Charm';

  const build = () =>
    scenario()
      .define(winds)
      .seat(0)
      .hand(WINDS, CHARM)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Forest')
      .battlefield(BEARS, ANGEL, BLADE)
      .battlefield(MIGHT, { attachedTo: BEARS })
      .battlefield(BLADE, { attachedTo: ANGEL })
      .seat(1)
      .battlefield(VANILLA, TROLL)
      .battlefield(WINGS, { attachedTo: VANILLA })
      .build();

  test('the card is valid and its AST is the SYNTHETIC one the engine tests play', () => {
    expect(validateCard(winds)).toEqual([]);
    sameAs(winds, 'SYNTHETIC Bare Purge');
  });

  test('the enchanted creatures live, the others die and no shield saves them', () => {
    const g = build();
    g.act(0).cast(CHARM, { targets: [TROLL], pay: true });
    g.passAll();
    g.act(0).cast(WINDS, { pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(VANILLA, 'battlefield', { seat: 1 });
    g.expect.zone(ANGEL, 'graveyard', { seat: 0 });
    g.expect.zone(TROLL, 'graveyard', { seat: 1 });
    g.expect.invariants();
  });
});

describe('Ethereal Armor: "Enchanted creature gets +1/+1 for each enchantment you control and has first strike."', () => {
  const armor = real('Ethereal Armor');
  const ARMOR = armor.name;

  test('the card is valid and its AST is the SYNTHETIC one the engine tests play', () => {
    expect(validateCard(armor)).toEqual([]);
    sameAs(armor, 'SYNTHETIC Armor of Many');
  });

  test('+1/+1 for each enchantment of its controller, first strike, and the count follows the board', () => {
    const g = scenario()
      .define(armor)
      .seat(0)
      .hand(ARMOR, MIGHT)
      .battlefield('Plains', 'Forest', 'Forest', BEARS)
      .seat(1)
      .battlefield(VANILLA)
      .battlefield(WINGS, { attachedTo: VANILLA })
      .build();
    g.act(0).cast(ARMOR, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 3, 3); // one enchantment of mine: the Armor
    g.expect.derived(BEARS, { keywords: ['firstStrike'] });
    g.act(0).cast(MIGHT, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.pt(BEARS, 2 + 2 + 2, 2 + 2 + 2); // two enchantments of mine now; the opponent's Aura does not count
  });
});

describe('Face of Divinity: "As long as another Aura is attached to enchanted creature, it has first strike and lifelink."', () => {
  const face = real('Face of Divinity');
  const FACE = face.name;

  test('the card is valid and its AST is the SYNTHETIC one the engine tests play', () => {
    expect(validateCard(face)).toEqual([]);
    sameAs(face, 'SYNTHETIC Twin Face Aura');
  });

  test('+2/+2 alone; with another Aura on the creature it has first strike and lifelink as well', () => {
    const alone = scenario()
      .define(face)
      .seat(0)
      .battlefield(BEARS)
      .battlefield(FACE, { attachedTo: BEARS })
      .seat(1)
      .build();
    alone.expect.pt(BEARS, 4, 4);
    alone.expect.derived(BEARS, { keywords: [] });
    const two = scenario()
      .define(face)
      .seat(0)
      .battlefield(BEARS)
      .battlefield(FACE, { attachedTo: BEARS })
      .battlefield(WINGS, { attachedTo: BEARS })
      .seat(1)
      .build();
    two.expect.derived(BEARS, { keywords: ['firstStrike', 'lifelink', 'flying'] });
    two.expect.invariants();
  });

  test('an Aura that arrives later turns it on', () => {
    const g = scenario()
      .define(face)
      .seat(0)
      .hand(WINGS)
      .battlefield('Island', 'Plains', BEARS)
      .battlefield(FACE, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.expect.derived(BEARS, { keywords: [] });
    g.act(0).cast(WINGS, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.derived(BEARS, { keywords: ['firstStrike', 'lifelink', 'flying'] });
  });
});

describe('Shield of the Oversoul: green gets +1/+1 and indestructible, white gets +1/+1 and flying', () => {
  const shield = real('Shield of the Oversoul');
  const SHIELD = shield.name;
  const start = (creature: string) =>
    scenario()
      .define(shield)
      .seat(0)
      .battlefield(creature)
      .battlefield(SHIELD, { attachedTo: creature })
      .seat(1)
      .build();

  test('the card is valid and its AST is the SYNTHETIC one the engine tests play', () => {
    expect(validateCard(shield)).toEqual([]);
    sameAs(shield, 'SYNTHETIC Dual Hue Aura');
  });

  test('a green creature', () => {
    const g = start(BEARS);
    g.expect.pt(BEARS, 3, 3);
    g.expect.derived(BEARS, { keywords: ['indestructible'] });
  });

  test('a white creature', () => {
    const g = start(ANGEL);
    g.expect.pt(ANGEL, 5, 5);
    g.expect.derived(ANGEL, { keywords: ['flying', 'vigilance'] });
  });

  test('a colorless creature gets nothing', () => {
    const g = start(VANILLA);
    g.expect.pt(VANILLA, 3, 3);
    g.expect.derived(VANILLA, { keywords: [] });
  });

  test('a green and white creature gets both', () => {
    const g = start(RECALLER);
    g.expect.pt(RECALLER, 4, 4);
    g.expect.derived(RECALLER, { keywords: ['indestructible', 'flying', 'vigilance'] });
  });
});

describe("Shardmage's Rescue: flash, hexproof the turn it entered, +1/+1", () => {
  const rescue = real("Shardmage's Rescue");
  const RESCUE = rescue.name;

  test('the card is valid and its AST is the SYNTHETIC one the engine tests play', () => {
    expect(validateCard(rescue)).toEqual([]);
    sameAs(rescue, 'SYNTHETIC Flash Ward Aura');
  });

  test('cast in response to Lightning Bolt it makes the creature hexproof: the Bolt has no legal target and does not resolve', () => {
    const g = scenario()
      .define(rescue)
      .seat(0)
      .hand(RESCUE)
      .battlefield('Plains', BEARS)
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BOLT, { targets: [BEARS], pay: true });
    g.expect.stack([BOLT]);
    g.act(1).pass();
    g.act(0).cast(RESCUE, { targets: [BEARS], pay: true });
    g.passAll(); // the Aura resolves
    g.expect.attached(RESCUE, BEARS);
    g.expect.derived(BEARS, { keywords: ['hexproof'] });
    g.passAll(); // the Bolt: its target is illegal now (CR 608.2b)
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(BOLT, 'graveyard', { seat: 1 });
    g.expect.damage(BEARS, 0);
    g.expect.life(0, 40);
  });

  test('an Aura that was there since an earlier turn gives no hexproof, but still +1/+1', () => {
    const g = scenario()
      .define(rescue)
      .seat(0)
      .battlefield(BEARS)
      .battlefield(RESCUE, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.expect.derived(BEARS, { keywords: [] });
    g.expect.pt(BEARS, 3, 3);
  });
});

describe('Strong Back: Equip abilities and Aura spells that target the enchanted creature cost {3} less, +2/+2 for each Aura and Equipment attached', () => {
  const back = real('Strong Back');
  const BACK = back.name;

  test('the card is valid and its AST is the SYNTHETIC one the engine tests play', () => {
    expect(validateCard(back)).toEqual([]);
    sameAs(back, 'SYNTHETIC Strong Spine Aura');
  });

  test('an Equip {4} that targets the enchanted creature costs {1}: one land pays for it, and the Equipment counts for +2/+2 as well', () => {
    const g = scenario()
      .define(back)
      .seat(0)
      .battlefield(COSTLY, 'Forest', BEARS, VANILLA)
      .battlefield(BACK, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.expect.pt(BEARS, 2 + 2, 2 + 2);
    g.act(0).activate(COSTLY, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(COSTLY, BEARS);
    g.expect.pt(BEARS, 2 + 1 + 4, 2 + 1 + 4);
    g.expect.tapped('Forest');
  });

  test('aimed at another creature the same Equip still costs {4}', () => {
    const g = scenario()
      .define(back)
      .seat(0)
      .battlefield(COSTLY, 'Forest', 'Forest', 'Forest', 'Forest', BEARS, VANILLA)
      .battlefield(BACK, { attachedTo: BEARS })
      .seat(1)
      .build();
    g.act(0).activate(COSTLY, { targets: [VANILLA] });
    const d = g.state.pending;
    expect(d?.kind === 'payMana' ? d.totalCost : null).toEqual(['4']);
  });

  test('an Aura spell that targets the enchanted creature costs {3} less, one that targets another creature does not', () => {
    const cheap = scenario()
      .define(back)
      .seat(0)
      .hand(MIGHT)
      .battlefield('Forest', BEARS, VANILLA)
      .battlefield(BACK, { attachedTo: BEARS })
      .seat(1)
      .build();
    cheap.act(0).cast(MIGHT, { targets: [BEARS], pay: true });
    cheap.passAll();
    cheap.expect.attached(MIGHT, BEARS);
    const dear = scenario()
      .define(back)
      .seat(0)
      .hand(MIGHT)
      .battlefield('Forest', 'Forest', BEARS, VANILLA)
      .battlefield(BACK, { attachedTo: BEARS })
      .seat(1)
      .build();
    dear.act(0).cast(MIGHT, { targets: [VANILLA] });
    const d = dear.state.pending;
    expect(d?.kind === 'payMana' ? d.totalCost : null).toEqual(['1', 'G']);
  });
});
