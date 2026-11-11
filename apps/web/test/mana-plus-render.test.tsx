/** Render checks for the more-mana-production UI (D-099): the combination question and the pool. */
import type { ObjectView, PayManaDecision, PriorityDecision } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ManaPool } from '../src/ui/board/PlayerStrip';
import { ChooserPopover } from '../src/ui/decisions/Chooser';
import { initialUi, type UiState } from '../src/ui/decisions/ui-state';
import { lookupIndexFor } from './decisions-helpers';

const noop = () => {};
const land = (oracleText: string) =>
  ({ id: 'o2', name: 'Land', oracleText, controller: 0 }) as unknown as ObjectView;

test('paying: a filter land asks "Add {R}{R}, {R}{W} or {W}{W}?" with a button per combination', () => {
  const pending = {
    kind: 'payMana',
    id: 1,
    seat: 0,
    source: 'o1',
    totalCost: ['1', 'W'],
    manaSources: [
      { object: 'o2', abilityIndex: 0 },
      {
        object: 'o2',
        abilityIndex: 1,
        combinations: [
          ['R', 'R'],
          ['R', 'W'],
          ['W', 'W'],
        ],
      },
    ],
  } as unknown as PayManaDecision;
  const ui: UiState = {
    ...initialUi(pending),
    chooser: { object: 'o2', abilityIndex: 1, left: 0, top: 0 },
  };
  const html = renderToStaticMarkup(
    <ChooserPopover pending={pending} ui={ui} act={noop} update={noop} close={noop} />,
  );
  expect(html).toContain('Add {R}{R}, {R}{W} or {W}{W}?');
  expect(html).toContain('aria-label="Add {R}{R}"');
  expect(html).toContain('aria-label="Add {R}{W}"');
  expect(html).toContain('aria-label="Add {W}{W}"');
  // Two symbols in each combination button.
  expect(html.match(/aria-label="[RW] mana"/g)).toHaveLength(6);
});

test('priority: the filter land asks the same question and a life cost is on the button', () => {
  const pending = {
    kind: 'priority',
    id: 1,
    seat: 0,
    options: [
      {
        kind: 'activateAbility',
        source: 'o2',
        abilityIndex: 1,
        color: null,
        combination: ['U', 'U'],
      },
      {
        kind: 'activateAbility',
        source: 'o2',
        abilityIndex: 1,
        color: null,
        combination: ['U', 'B'],
      },
    ],
  } as unknown as PriorityDecision;
  const ui: UiState = { ...initialUi(pending), chooser: { object: 'o2', left: 0, top: 0 } };
  const html = renderToStaticMarkup(
    <ChooserPopover
      pending={pending}
      ui={ui}
      act={noop}
      update={noop}
      close={noop}
      index={lookupIndexFor([land('{U/B}, {T}: Add {U}{U}, {U}{B}, or {B}{B}.')])}
    />,
  );
  expect(html).toContain('Add {U}{U} or {U}{B}?');

  const lifePending = {
    kind: 'priority',
    id: 1,
    seat: 0,
    options: [
      { kind: 'activateAbility', source: 'o2', abilityIndex: 0, color: 'W' },
      { kind: 'activateAbility', source: 'o2', abilityIndex: 0, color: 'U' },
    ],
  } as unknown as PriorityDecision;
  const lifeHtml = renderToStaticMarkup(
    <ChooserPopover
      pending={lifePending}
      ui={ui}
      act={noop}
      update={noop}
      close={noop}
      index={lookupIndexFor([land('{T}, Pay 1 life: Add one mana of any color.')])}
    />,
  );
  expect(lifeHtml).toContain('aria-label="Add W (pay 1 life)"');
  expect(lifeHtml).toContain('-1 life');
});

test('the pool shows its mana in the order W, U, B, R, G, C and nothing when it is empty', () => {
  const mana = (color: string) => ({ color, snow: false, source: 'o1', restriction: null });
  const html = renderToStaticMarkup(<ManaPool pool={[mana('R'), mana('W'), mana('R')] as never} />);
  expect(html).toContain('data-pool="WRR"');
  expect(html.match(/class="mana /g)).toHaveLength(3);
  expect(renderToStaticMarkup(<ManaPool pool={[]} />)).toBe('');
});
