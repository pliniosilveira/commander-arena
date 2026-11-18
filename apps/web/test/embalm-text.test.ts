/**
 * The words of Embalm (CR 702.128, issue 104): the chip, the label of its activation and the exceptions "if it was embalmed" of a permanent that enters as a copy (read from the
 * engine's SYNTHETIC cards, so a wording that drifts from the AST fails here). No DOM.
 */
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { entersAsCopyText } from '../src/game/dragons-text';
import { embalmedExceptionText } from '../src/game/embalm-text';
import { chipsOf } from '../src/ui/board/keywords';
import { activationLabel } from '../src/ui/decisions/ability-label';

const abilities = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

describe('Embalm', () => {
  test('the chip carries the cost and the reminder', () => {
    const chips = chipsOf({
      keywords: ['embalm'],
      restrictions: [],
      oracleText: 'Embalm {5}{W}',
    });
    expect(chips).toHaveLength(1);
    expect(chips[0]?.short).toBe('Emb');
    expect(chips[0]?.full).toContain('Embalm {5}{W}');
    expect(chips[0]?.full).toContain('white');
  });

  test('the activation label says the keyword and its cost, not the exile', () => {
    const cost = [{ kind: 'mana', symbols: ['5', 'W'] }, { kind: 'exileThis' }] as const;
    const label = activationLabel(undefined, {
      abilityIndex: 0,
      ability: {
        kind: 'activated',
        cost,
        effect: {
          kind: 'createToken',
          token: {
            kind: 'copyOf',
            object: { kind: 'this' },
            setColors: ['W'],
            noManaCost: true,
            addSubtypes: ['Zombie'],
            embalmed: true,
          },
          count: 1,
        },
        timing: 'sorcery',
        functionsIn: 'graveyard',
      } as never,
    });
    expect(label).toBe('Embalm {5}{W}');
  });
});

describe('"..., except if it was embalmed, ..."', () => {
  test('the exceptions read as one clause', () => {
    expect(
      embalmedExceptionText({ setColors: ['W'], noManaCost: true, addSubtypes: ['Zombie'] }),
    ).toBe(
      ", except if it was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types",
    );
  });

  test('a permanent that enters as a copy says them, from the engine card', () => {
    const rule = abilities('SYNTHETIC Many Faces').find((a) => a.kind === 'replacement');
    if (rule?.kind !== 'replacement' || rule.replacement.kind !== 'entersAsCopy') {
      throw new Error('shape');
    }
    expect(entersAsCopyText(rule.replacement, 'creature')).toBe(
      "As this creature enters, you may have it become a copy of any creature on the battlefield, except if it was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types",
    );
  });
});
