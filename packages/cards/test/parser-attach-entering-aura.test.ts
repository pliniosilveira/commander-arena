// Issue 89 (Silverquill Influence), Ajani's Chosen (D-660): "Whenever an enchantment you control enters, create a 2/2 white Cat creature token. If that enchantment is an Aura, you may
// attach it to the token." read through the whole pipeline: the real line, the nodes it lowers to and the near misses.
// The engine runs the nodes in packages/engine/test/scenario-xx-attach-entering-aura.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const line =
  'Whenever an enchantment you control enters, create a 2/2 white Cat creature token. If that enchantment is an Aura, you may attach it to the token.';

describe("Ajani's Chosen (CR 701.3, 303.4, 608.2c)", () => {
  test("the real first line of Ajani's Chosen", () => {
    const [ability] = readAll(line, 'creature').abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { types: ['enchantment'], controller: 'you' } },
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'createToken', count: 1 },
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'triggerSubject' },
              filter: { subtypes: ['Aura'] },
            },
            effect: {
              kind: 'may',
              effect: {
                kind: 'attach',
                object: { kind: 'triggerSubject' },
                to: { kind: 'moved' },
              },
            },
          },
        ],
      },
    });
  });

  test.each([
    [line.replace('attach it to the token', 'attach it to each token')],
    [line.replace('attach it to the token', 'attach them to the token')],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').stoppedAt).toBeDefined();
  });
});
