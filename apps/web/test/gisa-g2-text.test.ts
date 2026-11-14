/**
 * The words of group 2 of the Gisa deck (D-464 to D-468) as pure models: the triggers of a crime, of creating or sacrificing a token and of other creatures dying, the lord of
 * two creature types, the ward that costs mana and life, and the log line of a crime (read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here).
 * No DOM.
 */
import { type Ability, syntheticCard, type Trigger } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { describeEvents } from '../src/game/describe';
import { lordWordings } from '../src/game/static-text';
import { triggerWording } from '../src/game/trigger-text';
import { wardPrompt } from '../src/ui/decisions/optional';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

const triggersOf = (name: string): readonly Trigger[] =>
  abilitiesOf(name).flatMap((a) => (a.kind === 'triggered' ? [a.trigger] : []));

const say = (name: string, trigger: Trigger) => triggerWording(trigger, { self: name });

describe('the triggers', () => {
  test('a crime, said for each player', () => {
    const [crime] = triggersOf('SYNTHETIC Crypt Warlock');
    if (crime === undefined) throw new Error('no trigger');
    expect(say('SYNTHETIC Crypt Warlock', crime)).toBe('Whenever you commit a crime');
    expect(say('X', { kind: 'crimeCommitted', who: 'opponent' })).toBe(
      'Whenever an opponent commits a crime',
    );
    expect(say('X', { kind: 'crimeCommitted', who: 'any' })).toBe(
      'Whenever a player commits a crime',
    );
  });

  test('the creation of a token and the sacrifice of a token are two abilities, said by their own events', () => {
    const [created, sacrificed] = triggersOf('SYNTHETIC Token Leech');
    if (created === undefined || sacrificed === undefined) throw new Error('no triggers');
    expect(say('SYNTHETIC Token Leech', created)).toBe('Whenever you create a token');
    expect(say('SYNTHETIC Token Leech', sacrificed)).toBe('Whenever you sacrifice a token');
    expect(say('X', { kind: 'tokenCreated', who: 'opponent' })).toBe(
      'Whenever an opponent creates a token',
    );
  });

  test('one or more other creatures die', () => {
    const [dies] = triggersOf('SYNTHETIC Grave Scholar');
    if (dies === undefined) throw new Error('no trigger');
    expect(say('SYNTHETIC Grave Scholar', dies)).toBe('Whenever one or more other creatures die');
  });

  test('the crime of the creature card that works from the graveyard', () => {
    const [crime] = triggersOf('SYNTHETIC Restless Digger');
    if (crime === undefined) throw new Error('no trigger');
    expect(say('SYNTHETIC Restless Digger', crime)).toBe('Whenever you commit a crime');
  });
});

describe('the lord of two creature types', () => {
  test('the statics say "Skeletons and Zombies you control"', () => {
    expect(
      lordWordings(abilitiesOf('SYNTHETIC Crypt Warlock'), {
        noun: 'creature',
        subtypes: ['Human', 'Warlock'],
      }),
    ).toEqual([
      'Skeletons and Zombies you control get +1/+1.',
      'Skeletons and Zombies you control have menace.',
    ]);
  });
});

describe('ward with a mana cost and life', () => {
  test('the question names both costs', () => {
    expect(
      wardPrompt(
        [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'payLife', amount: 2 },
        ],
        'Lightning Bolt',
      ),
    ).toBe('Pay {2} and 2 life or Lightning Bolt is countered?');
  });
});

describe('the log', () => {
  test('a crime says who committed it, with what, and the rule', () => {
    const g = scenario()
      .seat(0)
      .library('Swamp', 'Swamp', 'Swamp')
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .library('Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();
    const before = g.state;
    const mark = g.mark();
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    const described = describeEvents(g.eventsSince(mark), before, g.state, 0);
    const crime = described.find((d) => d.text.includes('commit a crime'));
    expect(crime?.text).toBe('You commit a crime with Lightning Bolt.');
    expect(crime?.rule).toBe('CR 700.13');
  });
});
