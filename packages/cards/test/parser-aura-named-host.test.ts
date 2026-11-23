// Issue 89 (Silverquill Influence), Forum Filibuster and Gift of Immortality read through the whole pipeline: the real lines, the nodes they lower to and the near misses the grammar
// must not read. The engine runs the nodes in packages/engine/test/scenario-xx-aura-named-host.test.ts and in convert-grammar-engine-aura-named-host.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const TOKEN = 'create a 2/1 white and black Inkling creature token with flying.';
const FORUM = `${TOKEN} When you do, return up to one target Aura or Equipment card from your graveyard to the battlefield attached to that token.`;
const upkeep = (text: string) =>
  readAll(`At the beginning of your upkeep, ${text}`, 'enchantment').abilities;
const aura = (text: string) =>
  readAll(`Enchant creature\n${text}`, 'enchantment', ['Aura']).abilities;

describe('"Create a token. When you do, return up to one target Aura or Equipment card ... attached to that token." (CR 603.12, 303.4f, 400.7j)', () => {
  test('the real line of Forum Filibuster', () => {
    expect(upkeep(FORUM)).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'upkeep', whose: 'you' },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'createToken', count: 1 },
            {
              kind: 'reflexive',
              carriesMoved: true,
              targets: [
                {
                  id: 't1',
                  what: {
                    kind: 'object',
                    filter: {
                      zone: 'graveyard',
                      controller: 'you',
                      anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }],
                    },
                  },
                  min: 0,
                  max: 1,
                },
              ],
              effect: {
                kind: 'moveToZone',
                objects: { kind: 'target', id: 't1' },
                to: 'battlefield',
                controller: 'you',
                attachTo: { kind: 'moved' },
              },
            },
          ],
        },
      },
    ]);
  });

  test('a card that is only an Aura reads the same way', () => {
    const [ability] = upkeep(
      `${TOKEN} When you do, return target Aura card from your graveyard to the battlefield attached to that token.`,
    );
    expect(ability).toMatchObject({
      effect: {
        effects: [
          { kind: 'createToken' },
          { kind: 'reflexive', carriesMoved: true, effect: { attachTo: { kind: 'moved' } } },
        ],
      },
    });
  });

  test('Limit Break deck, group 1: several cards are read as one slot of up to two, each attached to the token', () => {
    const [ability] = upkeep(
      `${TOKEN} When you do, return up to two target Aura or Equipment cards from your graveyard to the battlefield attached to that token.`,
    );
    expect(ability).toMatchObject({
      effect: {
        effects: [
          { kind: 'createToken' },
          {
            kind: 'reflexive',
            carriesMoved: true,
            targets: [{ id: 't1', min: 0, max: 2 }],
            effect: { attachTo: { kind: 'moved' } },
          },
        ],
      },
    });
  });

  test.each([
    // No token to attach it to.
    [
      'At the beginning of your upkeep, return up to one target Aura or Equipment card from your graveyard to the battlefield attached to that token.',
    ],
    // Another host.
    [
      `At the beginning of your upkeep, ${TOKEN} When you do, return up to one target Aura card from your graveyard to the battlefield attached to target creature.`,
    ],
    [
      `At the beginning of your upkeep, ${TOKEN} When you do, return up to one target Aura card from your graveyard to the battlefield attached to it.`,
    ],
    // Not a card put onto the battlefield.
    [
      `At the beginning of your upkeep, ${TOKEN} When you do, return up to one target Aura card from your graveyard to your hand attached to that token.`,
    ],
    // A third kind.
    [
      `At the beginning of your upkeep, ${TOKEN} When you do, return up to one target Aura or Equipment or Saga card from your graveyard to the battlefield attached to that token.`,
    ],
    // The reflexive ability does not read the token: nothing says it is done by it.
    [`At the beginning of your upkeep, ${TOKEN} When you do, you gain 1 life.`],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'enchantment').stoppedAt).toBeDefined();
  });
});

describe('"When enchanted creature dies, return that card to the battlefield under its owner\'s control. Return this card to the battlefield attached to that creature at the beginning of the next end step." (CR 603.7c, 400.7, 303.4f)', () => {
  const GIFT =
    "When enchanted creature dies, return that card to the battlefield under its owner's control. Return this card to the battlefield attached to that creature at the beginning of the next end step.";

  test('the real second line of Gift of Immortality', () => {
    expect(aura(GIFT)[1]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'dies', what: { kind: 'attached' } },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'moveToZone',
            objects: { kind: 'triggerCard' },
            to: 'battlefield',
            controller: 'owner',
          },
          {
            kind: 'delayedTrigger',
            at: { step: 'endStep', whose: 'each' },
            effect: {
              kind: 'moveToZone',
              objects: { kind: 'thisCard' },
              to: 'battlefield',
              controller: 'you',
              attachTo: { kind: 'moved' },
            },
          },
        ],
      },
    });
  });

  test('"that card" of the first sentence is the card the creature became, not the creature', () => {
    const [, trigger] = aura(
      "When enchanted creature dies, return that card to the battlefield under its owner's control.",
    );
    expect(trigger).toMatchObject({
      effect: { kind: 'moveToZone', objects: { kind: 'triggerCard' }, controller: 'owner' },
    });
  });

  test.each([
    // Nothing returned before it: "that creature" is not the one that came back.
    [
      'When enchanted creature dies, return this card to the battlefield attached to that creature at the beginning of the next end step.',
    ],
    // Not the dies trigger of the enchanted creature.
    [
      "Whenever a creature dies, return that card to the battlefield under its owner's control. Return this card to the battlefield attached to that creature at the beginning of the next end step.",
    ],
    [
      "When enchanted creature becomes tapped, return that card to the battlefield under its owner's control. Return this card to the battlefield attached to that creature at the beginning of the next end step.",
    ],
    // Another moment, or no moment.
    [
      "When enchanted creature dies, return that card to the battlefield under its owner's control. Return this card to the battlefield attached to that creature at the beginning of your next end step.",
    ],
    [
      "When enchanted creature dies, return that card to the battlefield under its owner's control. Return this card to the battlefield attached to that creature.",
    ],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toBeDefined();
  });
});
