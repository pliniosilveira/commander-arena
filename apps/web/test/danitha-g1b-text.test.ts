/**
 * The words of group 1b of the Danitha deck (D-400 to D-404 provisional) as pure models: "protection from creatures" of an Aura, the cast trigger about a spell that targets a creature
 * you control, and the question "put it onto the battlefield?" of Cosmic Rebirth (read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here). No DOM.
 */
import {
  type Ability,
  type ConfirmOptionalDecision,
  type ObjectView,
  syntheticCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { lordWording } from '../src/game/static-text';
import { triggerWording } from '../src/game/trigger-text';
import { mayPutOntoBattlefieldPrompt, optionalAsk } from '../src/ui/decisions/optional';
import { lookupIndexFor } from './decisions-helpers';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

describe('protection from a card type is worded for an Aura', () => {
  const ctx = { self: 'This Aura', subtypes: ['Aura'] } as never;

  test('"Enchanted creature has protection from creatures"', () => {
    const statics = abilitiesOf('SYNTHETIC Creature Ward Aura').flatMap((a) =>
      a.kind === 'static' ? [lordWording(a.static, ctx)] : [],
    );
    expect(statics).toEqual([
      'Enchanted creature gets +1/+1',
      'Enchanted creature has protection from creatures',
    ]);
  });

  test('several types, and the chosen type of an older card', () => {
    const subject = { kind: 'attached' } as const;
    expect(
      lordWording(
        {
          kind: 'grantKeyword',
          subject,
          keyword: { kind: 'protection', from: 'cardType', types: ['artifact', 'sorcery'] },
        },
        ctx,
      ),
    ).toBe('Enchanted permanent has protection from artifacts and from sorceries');
    expect(
      lordWording(
        { kind: 'grantKeyword', subject, keyword: { kind: 'protection', from: 'chosenCardType' } },
        ctx,
      ),
    ).toBe('Enchanted permanent has protection from the chosen card type');
  });
});

describe('the cast trigger of Season of Growth', () => {
  const trigger = (index: number) => {
    const ability = abilitiesOf('SYNTHETIC Growth Watcher').filter((a) => a.kind === 'triggered')[
      index
    ];
    if (ability?.kind !== 'triggered') throw new Error('no trigger');
    return ability.trigger;
  };
  const ctx = { self: 'this enchantment', subtypes: [] } as never;

  test('says what the spell targets', () => {
    expect(triggerWording(trigger(1), ctx)).toBe(
      'Whenever you cast a spell that targets a creature you control',
    );
  });

  test('the older reading of "targets a creature" is worded too', () => {
    expect(
      triggerWording(
        {
          kind: 'castSpell',
          filter: { stackKind: 'spell', targetsObject: { types: ['creature'] } },
          by: 'you',
        },
        ctx,
      ),
    ).toBe('Whenever you cast a spell that targets a creature');
  });

  test('a filter of the target the words cannot say is not worded (never guessed)', () => {
    expect(
      triggerWording(
        {
          kind: 'castSpell',
          filter: { stackKind: 'spell', targetsObject: { types: ['creature'], zone: 'graveyard' } },
          by: 'you',
        },
        ctx,
      ),
    ).toBeNull();
  });
});

describe('the question of Cosmic Rebirth', () => {
  const TEXT =
    "Choose target permanent card in your graveyard. If it has mana value 3 or less, you may put it onto the battlefield. If you don't put it onto the battlefield, put it into your hand.\nYou gain 3 life.";
  const obj = (id: string, extra: Partial<ObjectView>): ObjectView =>
    ({
      id,
      name: `Card ${id}`,
      controller: 0,
      owner: 0,
      types: ['instant'],
      subtypes: [],
      counters: {},
      zone: 'stack',
      oracleText: '',
      keywords: [],
      targets: [],
      ...extra,
    }) as unknown as ObjectView;
  const spell = obj('o1', {
    name: 'Cosmic Rebirth',
    oracleText: TEXT,
    targets: [{ kind: 'object', id: 'o2', specId: 't1' }] as never,
  });
  const bears = obj('o2', { name: 'Grizzly Bears', zone: 'graveyard', types: ['creature'] });
  const d = {
    kind: 'confirmOptional',
    id: 'd1',
    seat: 0,
    source: 'o1',
    sourceName: 'Cosmic Rebirth',
    sourceOracleText: TEXT,
  } as unknown as ConfirmOptionalDecision;

  test('names the card, and says where it goes if it is not put onto the battlefield', () => {
    const index = lookupIndexFor([spell, bears]);
    expect(mayPutOntoBattlefieldPrompt(d, index)).toBe(
      "Put Grizzly Bears onto the battlefield? If you don't, it goes into your hand.",
    );
    expect(optionalAsk(d, index)).toMatchObject({
      yes: 'Put it onto the battlefield',
      no: 'Put it into your hand',
      cancellable: false,
    });
  });

  test('any other plain question keeps its words', () => {
    expect(mayPutOntoBattlefieldPrompt(d, lookupIndexFor([]))).toBeNull();
    expect(mayPutOntoBattlefieldPrompt(d, lookupIndexFor([spell]))).toBeNull();
    const other = lookupIndexFor([{ ...spell, oracleText: 'You may draw a card.' }, bears]);
    expect(mayPutOntoBattlefieldPrompt(d, other)).toBeNull();
    expect(optionalAsk(d, other).yes).toBe('Yes');
    // A question with a purpose or a cost is not this one.
    expect(
      mayPutOntoBattlefieldPrompt(
        { ...d, purpose: 'cascade' } as unknown as ConfirmOptionalDecision,
        lookupIndexFor([spell, bears]),
      ),
    ).toBeNull();
  });
});
