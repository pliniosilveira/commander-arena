// Stage P15 (M6): a line the grammar reads but whose engine feature is not listed is reported as
// "recognised, not runnable" naming that feature, never built and never read as something else. The
// engine lists every feature the stage needs, so the support check is replaced here by one that lacks
// them, one at a time, and the lowering must name what it needs of the engine (D-068).
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { type FaceType, withoutFeature } from './parser-p5-helpers';

describe('the lowerings of stage P15 name the engine feature they need', () => {
  test.each([
    ['keyword:flying', 'Create a 1/1 white Spirit creature token with flying.', 'sorcery'],
    ['token:custom', 'Create a 1/1 white Spirit creature token with flying.', 'sorcery'],
    [
      'amount:countOf',
      'Create a 0/1 green Plant creature token for each land you control.',
      'sorcery',
    ],
    ['token:Clue', 'Investigate.', 'sorcery'],
    ['effect:createToken', 'Investigate.', 'sorcery'],
    ['effect:untap', 'Target creature gets +1/+1 until end of turn. Untap it.', 'instant'],
    ['effect:tap', 'Target creature gets +1/+1 until end of turn. Tap it.', 'instant'],
    ['selector:anyOf', 'Exile target noncreature artifact or noncreature enchantment.', 'sorcery'],
    [
      'selector:anyOf',
      'Return target instant or sorcery card from your graveyard to your hand.',
      'sorcery',
    ],
    ['selector:each', 'Put a +1/+1 counter on each Plant creature you control.', 'sorcery'],
    ['selector:each', 'Creatures your opponents control attack this turn if able.', 'sorcery'],
    ['effect:restrict', 'Creatures your opponents control attack this turn if able.', 'sorcery'],
    ['duration:untilEndOfTurn', "Creatures you control can't be blocked this turn.", 'sorcery'],
    ['effect:exile', 'Exile all graveyards.', 'sorcery'],
    [
      'effect:moveToZone',
      'Return target instant or sorcery card from your graveyard to your hand.',
      'sorcery',
    ],
  ])('without %s: %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type as FaceType);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test.each([
    ['trigger:dies', 'When ~ is put into a graveyard from the battlefield, draw a card.'],
    ['trigger:permanentSacrificed', 'Whenever a player sacrifices a permanent, you gain 1 life.'],
    [
      'trigger:becomesTarget',
      'Whenever ~ becomes the target of a spell or ability an opponent controls, you gain 1 life.',
    ],
    ['trigger:entersBattlefield', 'Whenever an Equipment you control enters, you may draw a card.'],
    ['ability:triggered', 'Whenever a player sacrifices a permanent, you gain 1 life.'],
  ])('without %s: %s', (ref, text) => {
    const missing = withoutFeature(ref, text);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test.each([
    ['replacement:asEntersChoose', 'As ~ enters, choose a creature type.'],
    ['selector:chosenType', 'Creatures you control of the chosen type get +1/+1.'],
    ['selector:chosenColor', 'Creatures you control of the chosen color get +1/+0.'],
    ['selector:chosenType', 'Whenever you cast a creature spell of the chosen type, draw a card.'],
    ['selector:chosenType', 'Creature spells you cast of the chosen type cost {1} less to cast.'],
    ['static:setTypes', '~ is the chosen type in addition to its other types.'],
    ['static:costReduction', 'Creature spells you cast of the chosen type cost {1} less to cast.'],
  ])('without %s: %s', (ref, text) => {
    const missing = withoutFeature(ref, text, 'enchantment');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('without static:grantKeyword "All creatures have haste." is named, not run', () => {
    const missing = withoutFeature(
      'static:grantKeyword',
      'All creatures have haste.',
      'enchantment',
    );
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('static:grantKeyword');
  });

  test('without ability:activated "{T}: Untap another target permanent." is named', () => {
    const missing = withoutFeature('ability:activated', '{T}: Untap another target permanent.');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('ability:activated');
  });
});
