// What validateCard says about the multi-face layouts (SPEC 17.2 A7, D-007): the face count of each
// layout (CR 709, 712, 715), the Adventure being an instant or sorcery (CR 715.2), and the layouts
// and features of them the engine does not run, each refused with a reason that names the layout:
// Fuse (CR 702.102), Aftermath (CR 702.127), the permanent split cards of CR 709.5 (Rooms), a
// transforming card with a planeswalker or battle back face, flashback away from the front face,
// and the layouts flip and meld. Cards are SYNTHETIC.
import { describe, expect, test } from 'vitest';
import {
  type CardDefinition,
  type CardFace,
  type CardLayout,
  SUPPORTED_FEATURES,
  syntheticCard,
  validateCard,
  validateCardStructure,
} from '../src/index';

const SPLIT = syntheticCard('SYNTHETIC Singe // Mend');
const ADVENTURE = syntheticCard('SYNTHETIC Brawler Bear // Chop');
const MODAL = syntheticCard('SYNTHETIC Ridge Drake // Ridge Pass');
const TRANSFORM = syntheticCard('SYNTHETIC Moon Cub // Moon Beast');

const messages = (def: CardDefinition): string[] => validateCard(def).map((i) => i.message);
const withFace = (
  def: CardDefinition,
  index: number,
  patch: Partial<CardFace>,
): CardDefinition => ({
  ...def,
  faces: def.faces.map((f, i) => (i === index ? { ...f, ...patch } : f)),
});
const asLayout = (def: CardDefinition, layout: string): CardDefinition => ({
  ...def,
  layout: layout as CardLayout,
});

describe('the supported layouts', () => {
  test('each layout the registry lists has a card that validates clean', () => {
    expect(SUPPORTED_FEATURES.layouts).toEqual([
      'normal',
      'split',
      'adventure',
      'modal_dfc',
      'transform',
      'saga',
      // D-235: a Class (CR 716).
      'class',
      // D-214: a preparation card (CR 722).
      'prepare',
      // D-991: a meld card (CR 701.42, 712.4).
      'meld',
    ]);
    for (const def of [
      SPLIT,
      ADVENTURE,
      MODAL,
      TRANSFORM,
      syntheticCard('SYNTHETIC Rite of Three'),
      syntheticCard('SYNTHETIC Prepared Scout // Scout Tidings'),
      syntheticCard('SYNTHETIC Dusk Squire'),
      syntheticCard('SYNTHETIC Dawn Squire'),
    ]) {
      expect(validateCard(def), def.name).toEqual([]);
    }
    expect(validateCard(syntheticCard('SYNTHETIC Turn Over'))).toEqual([]);
  });

  test('a preparation card: an instant or sorcery prepare spell, "enters prepared" only on its first face (CR 722, D-214)', () => {
    const scout = syntheticCard('SYNTHETIC Prepared Scout // Scout Tidings');
    expect(validateCardStructure(scout)).toEqual([]);
    const creatureSpell = withFace(scout, 1, { types: ['creature'] });
    expect(validateCardStructure(creatureSpell).map((i) => i.path)).toContain('faces[1].types');
    // Not a card of the layout: "enters prepared" has no prepare spell to prepare.
    const normal = { ...scout, layout: 'transform' as const };
    expect(
      validateCardStructure(normal)
        .map((i) => i.message)
        .join(),
    ).toContain('enters prepared');
  });

  test('the face count of each layout', () => {
    // `normal` and `saga` have one face; the other four layouts have two.
    for (const def of [SPLIT, ADVENTURE, MODAL, TRANSFORM]) {
      const one = { ...def, faces: def.faces.slice(0, 1) };
      const issue = validateCardStructure(one).find((i) => i.path === 'faces');
      expect(issue?.message, def.name).toBe(`layout ${def.layout} needs 2 face(s), found 1`);
    }
    const normal = syntheticCard('SYNTHETIC Turn Over');
    const two = { ...normal, faces: [...normal.faces, ...SPLIT.faces.slice(0, 1)] };
    expect(validateCardStructure(two).map((i) => i.message)).toContain(
      'layout normal needs 1 face(s), found 2',
    );
    const three = { ...SPLIT, faces: [...SPLIT.faces, ...SPLIT.faces.slice(0, 1)] };
    expect(validateCardStructure(three).map((i) => i.message)).toContain(
      'layout split needs 2 face(s), found 3',
    );
  });

  test('the Adventure is an instant or sorcery (CR 715.2)', () => {
    const permanentAdventure = withFace(ADVENTURE, 1, { types: ['creature'], spell: null });
    const issues = validateCardStructure(permanentAdventure);
    expect(issues.map((i) => i.message)).toContain(
      'layout adventure needs faces[1] to be an instant or sorcery (CR 715.2)',
    );
  });
});

describe('what is refused, naming the layout', () => {
  test('Fuse and Aftermath on a split card', () => {
    const fuse = withFace(SPLIT, 0, {
      oracleText: 'Fuse (You may cast one or both halves.)\nSinge deals 2.',
    });
    expect(messages(fuse)).toEqual([
      'layout split with Fuse (CR 702.102) is not implemented by the engine yet',
    ]);
    const aftermath = withFace(SPLIT, 1, {
      oracleText: 'Aftermath (Cast this spell only from your graveyard.)',
    });
    expect(messages(aftermath)).toEqual([
      'layout split with Aftermath (CR 702.127) is not implemented by the engine yet',
    ]);
    // Reminder text in the middle of a line is not the keyword.
    expect(
      validateCard(withFace(SPLIT, 0, { oracleText: 'Draw a card. Aftermath is fun.' })),
    ).toEqual([]);
  });

  test('a split card that is a permanent (a Room, CR 709.5)', () => {
    const room = withFace(SPLIT, 0, { types: ['enchantment'], spell: null });
    expect(messages(room)[0]).toContain('layout split with a permanent half');
  });

  test('a transforming card whose back face is a planeswalker or a battle', () => {
    for (const type of ['planeswalker', 'battle'] as const) {
      const def = withFace(TRANSFORM, 1, {
        types: [type],
        power: null,
        toughness: null,
        loyalty: type === 'planeswalker' ? 4 : null,
        defense: type === 'battle' ? 3 : null,
      });
      expect(messages(def), type).toEqual([
        'layout transform with a planeswalker or battle back face is not implemented by the engine yet',
      ]);
    }
  });

  test('flashback away from the front face of a layout (it is read from face 0 only)', () => {
    const flashback = {
      kind: 'keyword',
      keyword: { kind: 'flashback', cost: [{ kind: 'mana', symbols: ['2'] }] },
    } as const;
    const back = withFace(MODAL, 1, {
      abilities: [...(MODAL.faces[1]?.abilities ?? []), flashback],
    });
    expect(messages(back)).toContain(
      'flashback on this face of layout modal_dfc is not implemented by the engine yet',
    );
    const split = withFace(SPLIT, 0, { abilities: [flashback] });
    expect(messages(split)).toEqual([
      'flashback on this face of layout split is not implemented by the engine yet',
    ]);
  });

  test('the layouts the engine does not model: flip, fuse, aftermath', () => {
    for (const layout of ['flip', 'fuse', 'aftermath', 'leveler']) {
      const def = asLayout(SPLIT, layout);
      expect(
        validateCard(def).some((i) => i.message.includes(`"${layout}"`)),
        layout,
      ).toBe(true);
    }
  });

  describe('a meld card (CR 701.42, 712.4, 712.8g; D-991, D-992)', () => {
    const DUSK = syntheticCard('SYNTHETIC Dusk Squire');
    const issues = (def: CardDefinition): string[] =>
      validateCard(def).map((i) => `${i.path}: ${i.message}`);
    const has = (def: CardDefinition, text: RegExp): boolean =>
      issues(def).some((m) => text.test(m));

    test('a meld card has two faces (its front and the combined face) and names its counterpart', () => {
      expect(validateCard(DUSK)).toEqual([]);
      expect(has({ ...DUSK, faces: [DUSK.faces[0] as CardFace] }, /needs 2 face/)).toBe(true);
      const { meld: _meld, ...noPartner } = DUSK;
      expect(has(noPartner, /needs the name of the other card/)).toBe(true);
      expect(
        has({ ...DUSK, meld: { partner: DUSK.name } }, /needs the name of the other card/),
      ).toBe(true);
    });

    test('only a card of layout meld names a counterpart or has the meld ability', () => {
      expect(
        has(
          { ...SPLIT, meld: { partner: 'X' } },
          /only a card of layout meld has a meld counterpart/,
        ),
      ).toBe(true);
      const withAbility = withFace(SPLIT, 0, { abilities: DUSK.faces[0]?.abilities ?? [] });
      expect(has(withAbility, /only a meld card has a meld ability/)).toBe(true);
    });

    test('the combined face is a permanent with no mana cost and a name of its own', () => {
      expect(
        has(
          withFace(DUSK, 1, { manaCost: ['5'] }),
          /combined face of a meld pair has no mana cost/,
        ),
      ).toBe(true);
      expect(
        has(
          withFace(DUSK, 1, { types: ['instant'] }),
          /combined face of a meld pair is a permanent/,
        ),
      ).toBe(true);
      expect(has(withFace(DUSK, 1, { name: DUSK.name }), /name of its own/)).toBe(true);
    });

    test('the meld ability names the counterpart and the combined face, with the intervening if', () => {
      const wrongPartner = withFace(DUSK, 0, {
        abilities: (DUSK.faces[0]?.abilities ?? []).map((a) =>
          a.kind === 'triggered' && a.effect.kind === 'meld'
            ? { ...a, effect: { ...a.effect, partner: 'Somebody Else' } }
            : a,
        ),
      });
      expect(has(wrongPartner, /must name this card's counterpart/)).toBe(true);
      const noIf = withFace(DUSK, 0, {
        abilities: (DUSK.faces[0]?.abilities ?? []).map((a) => {
          if (a.kind !== 'triggered') return a;
          const { interveningIf: _if, ...rest } = a;
          return rest;
        }),
      });
      expect(has(noIf, /intervening "if/)).toBe(true);
      // A meld effect that is only a part of a larger effect is not run.
      const nested = withFace(DUSK, 0, {
        abilities: (DUSK.faces[0]?.abilities ?? []).map((a) =>
          a.kind === 'triggered' && a.effect.kind === 'meld'
            ? { ...a, effect: { kind: 'sequence' as const, effects: [a.effect] } }
            : a,
        ),
      });
      expect(has(nested, /whole effect of a triggered ability/)).toBe(true);
    });

    test('a combined face that asks a question as it enters is refused (not run)', () => {
      const riot = withFace(DUSK, 1, {
        abilities: [{ kind: 'keyword', keyword: { kind: 'riot' } }],
      });
      expect(has(riot, /replacement effect, riot or devour on the combined face/)).toBe(true);
    });
  });

  test('an unsupported card with a layout the engine models is structurally valid', () => {
    const unsupported: CardDefinition = { ...SPLIT, support: 'unsupported' };
    expect(validateCardStructure(unsupported)).toEqual([]);
    expect(validateCard(unsupported)).toEqual([]);
  });
});
