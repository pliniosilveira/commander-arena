// Issue 89 (Silverquill Influence), Songbirds' Blessing (D-609): "Whenever enchanted creature attacks, reveal cards from the top of your library until you reveal an Aura card. You may
// put that card onto the battlefield. If you don't, put it into your hand. Put the rest on the bottom of your library in a random order." read through the whole pipeline.
// The engine runs the nodes in packages/engine/test/scenario-xx-reveal-until-may-put.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const line =
  "Whenever enchanted creature attacks, reveal cards from the top of your library until you reveal an Aura card. You may put that card onto the battlefield. If you don't, put it into your hand. Put the rest on the bottom of your library in a random order.";

describe("Songbirds' Blessing (CR 701.20, 303.4f, 608.2c)", () => {
  test("the real second line of Songbirds' Blessing", () => {
    const abilities = readAll(`Enchant creature\n${line}`, 'enchantment', ['Aura']).abilities;
    expect(abilities[1]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'attached' } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'revealUntil', filter: { subtypes: ['Aura'] }, put: 'none' },
          {
            kind: 'may',
            effect: { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'battlefield' },
          },
          {
            kind: 'conditional',
            condition: { kind: 'not', term: { kind: 'didPrevious' } },
            effect: { kind: 'moveToZone', objects: { kind: 'moved' }, to: 'hand' },
          },
        ],
      },
    });
  });

  test.each([
    [line.replace('put it into your hand', 'put it into your graveyard')],
    [line.replace('in a random order', 'in any order')],
    [line.replace(" If you don't, put it into your hand.", '')],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(`Enchant creature\n${text}`, 'enchantment', ['Aura']).stoppedAt).toBeDefined();
  });
});
