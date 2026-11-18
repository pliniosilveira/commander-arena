// Issue 89 (Silverquill Influence), Armored Skyhunter (D-608): "Whenever this creature attacks, look at the top six cards of your library. You may put an Aura or Equipment card from
// among them onto the battlefield. If an Equipment is put onto the battlefield this way, you may attach it to a creature you control. Put the rest of those cards on the bottom of your
// library in a random order." read through the whole pipeline: the real line, the nodes it lowers to and the near misses.
// The engine runs the nodes in packages/engine/test/scenario-xx-look-put-attach.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const line =
  'Whenever this creature attacks, look at the top six cards of your library. You may put an Aura or Equipment card from among them onto the battlefield. If an Equipment is put onto the battlefield this way, you may attach it to a creature you control. Put the rest of those cards on the bottom of your library in a random order.';

describe('Armored Skyhunter (CR 401.2, 303.4f, 701.3)', () => {
  test('the real second line of Armored Skyhunter', () => {
    const abilities = readAll(`Flying\n${line}`, 'creature').abilities;
    expect(abilities[1]).toEqual({
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'lookAtTop',
            count: 6,
            take: {
              filter: { anyOf: [{ subtypes: ['Aura'] }, { subtypes: ['Equipment'] }] },
              max: 1,
              to: 'battlefield',
            },
            rest: 'bottomRandom',
          },
          {
            kind: 'conditional',
            condition: {
              kind: 'objectMatches',
              of: { kind: 'moved' },
              filter: { subtypes: ['Equipment'] },
            },
            effect: {
              kind: 'sequence',
              effects: [
                {
                  kind: 'chooseObjects',
                  id: 'attach1',
                  filter: { zone: 'battlefield', types: ['creature'], controller: 'you' },
                  count: 1,
                },
                {
                  kind: 'attach',
                  object: { kind: 'moved' },
                  to: { kind: 'chosen', id: 'attach1' },
                },
              ],
            },
          },
        ],
      },
    });
  });

  test.each([
    [line.replace('in a random order', 'in any order')],
    [line.replace('onto the battlefield. If', 'into your hand. If')],
    [line.replace('to a creature you control', 'to a creature')],
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature').stoppedAt).toBeDefined();
  });
});
