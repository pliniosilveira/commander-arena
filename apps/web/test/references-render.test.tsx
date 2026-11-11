/**
 * The D-092 references questions rendered from real games of the hidden SYNTHETIC deck
 * `synthetic-references`: the counterspell's payment dialog, the "may search" dialog asked during
 * the opponent's spell, and the panel of a bounce land's choice.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { DecisionLayer } from '../src/ui/decisions/DecisionLayer';
import { useInteraction } from '../src/ui/interaction';
import { StoreProvider } from '../src/ui/store-context';
import {
  bounceAsk,
  counterAsk,
  type RefStore,
  searchAsk,
  searchRefs,
  startStore,
} from './references-decks';

vi.setConfig({ testTimeout: 60_000 });

function ProbeBoard() {
  const i = useInteraction();
  return <div data-testid="probe" data-clickable={[...i.clickable].join(' ')} />;
}

const live = (store: RefStore) => ({ ...store, getInitialState: () => store.getState() });

const render = (store: RefStore): string =>
  renderToStaticMarkup(
    <StoreProvider store={live(store)}>
      <DecisionLayer>
        <ProbeBoard />
      </DecisionLayer>
    </StoreProvider>,
  );

async function reach(
  accept: Parameters<typeof searchRefs>[1],
  opts: Parameters<typeof searchRefs>[2] = {},
): Promise<RefStore> {
  const reached = await searchRefs(startStore, accept, opts);
  if (reached === null) throw new Error('no seed reaches the situation');
  return (reached.session as typeof reached.session & { store: RefStore }).store;
}

test("the counterspell question: a dialog named for the counterspell, Pay and Don't pay, no Cancel", async () => {
  const store = await reach(
    (view) => counterAsk(view) && view.stack.some((o) => o.name === 'SYNTHETIC Soft Counter'),
    { creatureMana: 5 },
  );
  const html = render(store);
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-label="Counterspell"');
  expect(html).toContain('SYNTHETIC Soft Counter');
  expect(html).toContain('Counter target spell unless its controller pays {3}.');
  expect(html).toMatch(/Pay \{3\} or [^<]+ is countered by SYNTHETIC Soft Counter\?/);
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Pay<\/button>/);
  expect(html).toContain('>Don&#x27;t pay<');
  expect(html).not.toContain('>Cancel<');
  // Not the wording of the other questions.
  expect(html).not.toContain('aria-label="Ward"');
  expect(html).not.toContain('enters tapped');
  expect(html).not.toContain('You may do this');
  expect(html).toContain('data-clickable=""');
});

test("the search question: a dialog that says the opponent cast the spell; Search and Don't search", async () => {
  const store = await reach(searchAsk);
  const html = render(store);
  expect(html).toContain('role="dialog"');
  expect(html).toContain('aria-label="Search"');
  expect(html).toContain('SYNTHETIC Banish Seek Land');
  expect(html).toContain('(the opponent&#x27;s spell) lets you search your library. Search?');
  expect(html).toMatch(/<button[^>]*data-dec-primary[^>]*>Search<\/button>/);
  expect(html).toContain('>Don&#x27;t search<');
  expect(html).not.toContain('>Cancel<');
  expect(html).not.toContain('You may do this');
});

test("a bounce land's choice: the sacrifice panel is not used; the prompt, the lands and no Cancel", async () => {
  const store = await reach(bounceAsk, { bounce: true });
  const pending = store.getState().snapshot?.view.pending;
  if (pending?.kind !== 'choosePermanent') throw new Error('wrong decision');
  const html = render(store);
  expect(html).toContain('aria-label="Permanents to choose"');
  expect(html).toContain('Choose for SYNTHETIC Bounce Land');
  expect(html).not.toContain('Permanents to sacrifice');
  expect(html).not.toContain('Sacrifice for');
  expect(html).toContain('Choose a land you control to return to its owner&#x27;s hand.');
  expect(html.match(/class="dec-chip"/g)).toHaveLength(pending.legal.length);
  expect(html).toContain('0 of 1 chosen');
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Confirm<\/button>/);
  expect(html).not.toContain('>Cancel<');
  const clickable = /data-clickable="([^"]*)"/.exec(html)?.[1]?.split(' ') ?? [];
  expect([...clickable].sort()).toEqual([...pending.legal].sort());
});

test("with automatic payment the autopilot pays a counterspell's mana after the answer", async () => {
  const store = await reach(
    (view) => counterAsk(view) && view.stack.some((o) => o.name === 'SYNTHETIC Soft Counter'),
    { creatureMana: 5 },
  );
  await store.getState().act({ kind: 'acceptOptional' });
  const view = store.getState().snapshot?.view;
  expect(view?.pending?.kind).not.toBe('payMana');
  const lines = store.getState().log.map((l) => l.text);
  expect(lines.some((t) => /^You pay \{3\} so .+ is not countered\.$/.test(t))).toBe(true);
  expect(lines.some((t) => t.includes('is countered'))).toBe(false);
});
