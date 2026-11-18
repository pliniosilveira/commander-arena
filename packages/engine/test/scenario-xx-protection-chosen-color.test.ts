// Issue 89 (Silverquill Influence), "Enchanted creature has protection from the chosen color. This effect doesn't remove this Aura." (D-652; Flickering Ward).
// Pins: CR 702.16a-d (protection from a color: can't be targeted by, enchanted by or damaged by sources of that color), CR 607.2d (the choice made as the Aura entered),
// CR 704.5m (an Aura attached to an illegal object is put into its owner's graveyard: the exception keeps this one), CR 303.4d.
// Cards: the SYNTHETIC Auras of this file, the real Grizzly Bears and Lightning Bolt.
import { describe, expect, test } from 'vitest';
import { derive } from '../src/rules/derive';
import { scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';

const RED_WARD = 'SYNTHETIC Red Ward Aura'; // A red Aura: as it enters, choose a color. Enchanted creature has protection from the chosen color. This effect doesn't remove this Aura.
const PLAIN_RED = 'SYNTHETIC Plain Red Aura'; // Enchant creature (red).
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

const ward = (exceptSource: boolean) =>
  singleFaceCard({
    name: RED_WARD,
    manaCost: ['1', 'R'],
    types: ['enchantment'],
    subtypes: ['Aura'],
    colors: ['R'],
    colorIdentity: ['R'],
    oracleText: 'Enchant creature',
    abilities: [
      { kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } },
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'color' } },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: { kind: 'attached' },
          keyword: {
            kind: 'protection',
            from: 'chosenColor',
            ...(exceptSource ? { exceptSource: true as const } : {}),
          },
        },
      },
    ],
  });

const plainRed = singleFaceCard({
  name: PLAIN_RED,
  manaCost: ['R'],
  types: ['enchantment'],
  subtypes: ['Aura'],
  colors: ['R'],
  colorIdentity: ['R'],
  oracleText: 'Enchant creature',
  abilities: [{ kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } }],
});

const board = (chosen: 'R' | 'U' | undefined, exceptSource = true) =>
  scenario()
    .seat(0)
    .define(ward(exceptSource))
    .define(plainRed)
    .hand(BOLT, PLAIN_RED)
    .library(...LIBRARY)
    .battlefield('Mountain', 'Mountain')
    .battlefield(BEARS)
    .battlefield(RED_WARD, {
      attachedTo: BEARS,
      ...(chosen === undefined ? {} : { chosen: { color: chosen } }),
    })
    .seat(1)
    .library(...LIBRARY)
    .at('precombatMain')
    .build();

const protectedFromRed = (g: ReturnType<typeof board>) =>
  derive(g.state, g.object(g.id(BEARS))).abilities.some(
    (a) => a.kind === 'keyword' && a.keyword.kind === 'protection',
  );

describe('"Enchanted creature has protection from the chosen color. This effect doesn\'t remove this Aura."', () => {
  test("the creature has protection from the color chosen: a red spell can't target it", () => {
    const g = board('R');
    expect(protectedFromRed(g)).toBe(true);
    expect(() => g.act(0).cast(BOLT, { targets: [BEARS], pay: true })).toThrow();
  });

  test('the Aura is red, as is the color chosen, and it stays attached', () => {
    const g = board('R');
    g.passAll();
    g.expect.attached(RED_WARD, BEARS);
    g.expect.zone(RED_WARD, 'battlefield', { seat: 0 });
  });

  test('another red Aura can not be put on the creature (CR 702.16d), and a color not chosen gives no protection from red', () => {
    const g = board('R');
    expect(() => g.act(0).cast(PLAIN_RED, { targets: [BEARS], pay: true })).toThrow();
    const blue = board('U');
    blue.act(0).cast(BOLT, { targets: [BEARS], pay: true });
  });

  test('no color chosen: no protection', () => {
    expect(protectedFromRed(board(undefined))).toBe(false);
  });

  test('without the exception the red Aura would fall off a creature protected from red (CR 704.5m)', () => {
    const g = board('R', false);
    g.passAll();
    g.expect.zone(RED_WARD, 'graveyard', { seat: 0 });
  });
});
