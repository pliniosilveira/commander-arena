/**
 * The words of group 5 of the Hashaton deck (D-382 to D-385): the exceptions of a token copy, the kind of card a discard trigger names, Eternalize (the label
 * of its activation and the chip) and the copies of the tokens of the chosen type (read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here).
 * No DOM.
 */
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import {
  copiesOfTokensText,
  copyExceptionsText,
  discardedCardWords,
} from '../src/game/hashaton-g5-text';
import { tokenWords } from '../src/game/token-text';
import { triggerWording } from '../src/game/trigger-text';
import { chipsOf } from '../src/ui/board/keywords';
import { activationLabel } from '../src/ui/decisions/ability-label';

const abilities = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

describe('the exceptions of a copy', () => {
  test('the numbers, the colors and the creature types together read as one phrase', () => {
    expect(
      copyExceptionsText({
        kind: 'copyOf',
        object: { kind: 'this' },
        setPt: { power: 4, toughness: 4 },
        setColors: ['B'],
        setCreatureTypes: ['Zombie'],
      }),
    ).toBe(", except it's a 4/4 black Zombie");
    expect(
      copyExceptionsText({
        kind: 'copyOf',
        object: { kind: 'this' },
        setPt: { power: 2, toughness: 2 },
        setColors: ['U', 'R'],
        setCreatureTypes: ['Elf', 'Wizard'],
      }),
    ).toBe(", except it's a 2/2 blue and red Elf Wizard");
  });

  test('Eternalize: one clause for each, in the order of the rule', () => {
    expect(
      copyExceptionsText({
        kind: 'copyOf',
        object: { kind: 'this' },
        setColors: ['B'],
        setPt: { power: 4, toughness: 4 },
        noManaCost: true,
        addSubtypes: ['Zombie'],
      }),
    ).toBe(
      ", except it's black, it's 4/4, it has no mana cost, and it's a Zombie in addition to its other types",
    );
  });

  test('no exception of a characteristic says nothing', () => {
    expect(copyExceptionsText({ kind: 'copyOf', object: { kind: 'this' } })).toBe('');
    expect(
      copyExceptionsText({ kind: 'copyOf', object: { kind: 'this' }, addSubtypes: ['Spirit'] }),
    ).toBe('');
  });

  test('the tapped copy of the card discarded, as Scarab Fist makes it', () => {
    const trigger = abilities('SYNTHETIC Scarab Fist')[0];
    if (trigger?.kind !== 'triggered' || trigger.effect.kind !== 'mayPay') throw new Error('shape');
    const made = trigger.effect.effect;
    if (made.kind !== 'createToken') throw new Error('shape');
    expect(tokenWords(made.token, true, () => 'that card').one).toBe(
      "tapped token that's a copy of that card, except it's a 4/4 black Zombie",
    );
  });
});

describe('the discard trigger', () => {
  test('names the kind of card', () => {
    expect(discardedCardWords(undefined)).toBe('a card');
    expect(discardedCardWords({ types: ['creature'] })).toBe('a creature card');
    expect(discardedCardWords({ types: ['artifact'] })).toBe('an artifact card');
    expect(discardedCardWords({ notTypes: ['land'] })).toBe('a nonland card');
    // A filter the words cannot say is left unsaid, never guessed at.
    expect(discardedCardWords({ types: ['creature'], colors: ['B'] })).toBeNull();
    expect(discardedCardWords({ types: ['creature', 'land'] })).toBeNull();
  });

  test('"Whenever you discard a creature card" on the stack and in the gist', () => {
    const trigger = abilities('SYNTHETIC Scarab Fist')[0];
    if (trigger?.kind !== 'triggered') throw new Error('shape');
    expect(triggerWording(trigger.trigger, { self: 'SYNTHETIC Scarab Fist' })).toBe(
      'Whenever you discard a creature card',
    );
    const land = abilities('SYNTHETIC Scarab Watcher')[0];
    if (land?.kind !== 'triggered') throw new Error('shape');
    expect(triggerWording(land.trigger, { self: 'SYNTHETIC Scarab Watcher' })).toBe(
      'Whenever you discard a land card',
    );
  });
});

describe('Eternalize', () => {
  const ability = (name: string) => {
    const entry = abilities(name).find((a) => a.kind === 'keyword');
    if (entry?.kind !== 'keyword') throw new Error('no keyword');
    return entry;
  };

  test('the engine expands the keyword into the activation the label calls Eternalize', () => {
    expect(ability('SYNTHETIC Wit Champion').keyword.kind).toBe('eternalize');
  });

  test('the chip carries the cost and the reminder', () => {
    const chips = chipsOf({
      keywords: ['eternalize'],
      restrictions: [],
      oracleText: 'Eternalize {5}{U}{U}',
    });
    expect(chips).toHaveLength(1);
    expect(chips[0]?.short).toBe('Et');
    expect(chips[0]?.full).toContain('Eternalize {5}{U}{U}');
    expect(chips[0]?.full).toContain('Zombie');
  });

  test('the activation label says the keyword and its cost, not the exile', () => {
    const cost = [{ kind: 'mana', symbols: ['5', 'U', 'U'] }, { kind: 'exileThis' }] as const;
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
            setColors: ['B'],
            setPt: { power: 4, toughness: 4 },
            noManaCost: true,
            addSubtypes: ['Zombie'],
          },
          count: 1,
        },
        timing: 'sorcery',
        functionsIn: 'graveyard',
      } as never,
    });
    expect(label).toBe('Eternalize {5}{U}{U}');
  });
});

describe('"For each token you control of the chosen type that entered this turn, create a token that\'s a copy of it"', () => {
  test('is worded from the group', () => {
    const trigger = abilities('SYNTHETIC Solidarity Echo').find((a) => a.kind === 'triggered');
    if (trigger?.kind !== 'triggered' || trigger.effect.kind !== 'createCopies') {
      throw new Error('shape');
    }
    expect(copiesOfTokensText(trigger.effect)).toBe(
      "For each token you control of the chosen type that entered this turn, create a token that's a copy of it",
    );
  });

  test('a copy that adds an ability, or a group of another kind, is left unsaid', () => {
    expect(
      copiesOfTokensText({
        kind: 'createCopies',
        objects: { kind: 'each', filter: { token: true, controller: 'you' } },
        abilities: [{ kind: 'keyword', keyword: { kind: 'haste' } }],
      }),
    ).toBeNull();
    expect(
      copiesOfTokensText({
        kind: 'createCopies',
        objects: { kind: 'each', filter: { types: ['creature'], controller: 'you' } },
      }),
    ).toBeNull();
  });
});
