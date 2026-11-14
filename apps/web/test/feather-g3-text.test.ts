/**
 * The words of group 3 of the Feather deck (D-437 to D-439) as pure models: the cast triggers about a spell that targets the permanent or only it, the disjunction of an
 * Equipment spell and a spell that targets a creature you control, the copies for each other creature, and the exile of a spell as it resolves (read from the engine's SYNTHETIC cards, so a
 * wording that drifts from the AST fails here). No DOM.
 */
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { filterPhrase, triggerWording } from '../src/game/trigger-text';
import { triggerGist } from '../src/ui/decisions/ability-label';

const triggerOf = (name: string): Extract<Ability, { kind: 'triggered' }> => {
  const face = syntheticCard(name).faces[0];
  const ability = face?.abilities.find((a) => a.kind === 'triggered');
  if (ability?.kind !== 'triggered') throw new Error(`no trigger on ${name}`);
  return ability;
};

const CTX = { self: 'this creature', subtypes: [] } as never;
const words = (name: string) => triggerWording(triggerOf(name).trigger, CTX);
const does = (name: string) => triggerGist(triggerOf(name), undefined);

describe('the cast triggers', () => {
  test('a spell that targets the creature itself', () => {
    expect(words('SYNTHETIC Heroic Captain')).toBe(
      'Whenever you cast a spell that targets this creature',
    );
  });

  test('a spell that targets only the creature itself, for you and for any player', () => {
    expect(words('SYNTHETIC Echo Grinder')).toBe(
      'Whenever you cast an instant or sorcery that targets only this creature',
    );
    expect(words('SYNTHETIC Mirror Wyrm')).toBe(
      'Whenever a player casts an instant or sorcery that targets only this creature',
    );
  });

  test('an Equipment spell or a spell that targets a creature you control', () => {
    expect(words('SYNTHETIC Cast Draw Knight')).toBe(
      'Whenever you cast an Equipment spell or a spell that targets a creature you control',
    );
  });

  test('an instant or sorcery spell that targets a creature you control', () => {
    expect(words('SYNTHETIC Spell Recycler')).toBe(
      'Whenever you cast an instant or sorcery that targets a creature you control',
    );
  });

  test('without the name of the card the words say "this permanent"', () => {
    expect(filterPhrase({ stackKind: 'spell', targetsOnly: { isSource: true } }, 'spell')).toBe(
      'a spell that targets only this permanent',
    );
  });

  test('a filter the words cannot say is not worded (never guessed)', () => {
    expect(
      filterPhrase(
        { stackKind: 'spell', targetsOnly: { isSource: true, types: ['creature'] } },
        'spell',
        'this creature',
      ),
    ).toBeNull();
    expect(
      filterPhrase(
        {
          stackKind: 'spell',
          anyOf: [{ subtypes: ['Equipment'] }, { targetsObject: { zone: 'graveyard' } }],
        },
        'spell',
      ),
    ).toBeNull();
  });
});

describe('what the triggers do', () => {
  test('the copies for each other creature, for you and for that player', () => {
    expect(does('SYNTHETIC Echo Grinder')).toBe(
      'Copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures',
    );
    expect(does('SYNTHETIC Mirror Wyrm')).toBe(
      'That player copies that spell for each other creature they control that the spell could target. Each copy targets a different one of those creatures',
    );
  });

  test('the exile as the spell resolves, with the return', () => {
    expect(does('SYNTHETIC Spell Recycler')).toBe(
      'Exile that card instead of putting it into your graveyard as it resolves. If you do, return it to your hand at the beginning of the next end step',
    );
  });
});
