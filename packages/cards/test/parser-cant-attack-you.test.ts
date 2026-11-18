// Issue 89 (Silverquill Influence), group 10 (D-647): "[Group] can't attack you or planeswalkers you control." (Combat Calligrapher: "Inklings can't attack you or planeswalkers you
// control."; Eriette of the Charmed Apple: "Each creature that's enchanted by an Aura you control can't attack you or planeswalkers you control."): the real Oracle lines read through the
// whole pipeline, the nodes they lower to, SYNTHETIC variants and the near misses. The engine runs what is lowered in packages/engine/test/scenario-xx-cant-attack-you.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const creature = (text: string) => readAll(text, 'creature', ['Bird', 'Cleric']).abilities;

describe('"[Group] can\'t attack you or planeswalkers you control." (CR 508.1a)', () => {
  test("the line of Combat Calligrapher: Inklings can't attack you or planeswalkers you control", () => {
    expect(creature("Inklings can't attack you or planeswalkers you control.")).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'cantAttackYou',
          creatures: { subtypes: ['Inkling'] },
          planeswalkers: true,
        },
      },
    ]);
  });

  test("the real line of Eriette: each creature that's enchanted by an Aura you control", () => {
    expect(
      creature(
        "Each creature that's enchanted by an Aura you control can't attack you or planeswalkers you control.",
      ),
    ).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'cantAttackYou',
          creatures: { types: ['creature'], enchantedByYou: true },
          planeswalkers: true,
        },
      },
    ]);
  });

  test('creatures an opponent controls (SYNTHETIC)', () => {
    expect(
      creature("Creatures your opponents control can't attack you or planeswalkers you control."),
    ).toMatchObject([
      {
        static: {
          kind: 'cantAttackYou',
          creatures: { types: ['creature'], controller: 'opponent' },
        },
      },
    ]);
  });

  test.each([
    "Each creature that's enchanted by an Aura you control can't attack you.",
    "Inklings can't attack you or planeswalkers you control",
    "Inklings can't attack you or planeswalkers.",
    "Inklings can't attack or planeswalkers you control.",
    "Each creature that's enchanted by an Aura can't attack you or planeswalkers you control.",
    "Inkling can't attack you or planeswalkers you control.",
  ])('is dropped, never half read (SYNTHETIC): %s', (text) => {
    expect(dropped(text, 'creature', ['Bird']).text).toBe(text);
  });
});
