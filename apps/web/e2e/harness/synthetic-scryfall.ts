/**
 * A SYNTHETIC Scryfall for the import e2e tests (import.e2e.ts). Requests to
 * `api.scryfall.com` are intercepted and `POST /cards/collection` is answered with cards generated
 * from the requested names: nothing here is real card data. The bears are vanilla (supported);
 * every fourth one has the text "Draw a card.", which the parser does not read (unsupported).
 */
import type { Page, Route } from '@playwright/test';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': '*',
};

const BASICS: Readonly<Record<string, string>> = {
  plains: 'W',
  island: 'U',
  swamp: 'B',
  mountain: 'R',
  forest: 'G',
};

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** SYNTHETIC: the card a requested name stands for, or undefined for an unknown name. */
export function syntheticCard(name: string): Record<string, unknown> | undefined {
  const key = name.trim().toLowerCase();
  const common = {
    object: 'card',
    id: `synthetic-id-${slug(name)}`,
    oracle_id: `synthetic-oracle-${slug(name)}`,
    layout: 'normal',
    cmc: 0,
    keywords: [],
    legalities: { commander: 'legal' },
    edhrec_rank: 1000,
  };
  const basic = BASICS[key];
  if (basic !== undefined) {
    const proper = `${key[0]?.toUpperCase()}${key.slice(1)}`;
    return {
      ...common,
      name: proper,
      mana_cost: '',
      type_line: `Basic Land — ${proper}`,
      oracle_text: `({T}: Add {${basic}}.)`,
      colors: [],
      color_identity: [basic],
      produced_mana: [basic],
    };
  }
  if (key === 'synthetic commander') {
    return {
      ...common,
      name: 'SYNTHETIC Commander',
      mana_cost: '{2}{W}',
      cmc: 3,
      type_line: 'Legendary Creature — Synthetic Hero',
      oracle_text: 'Vigilance',
      keywords: ['Vigilance'],
      power: '3',
      toughness: '3',
      colors: ['W'],
      color_identity: ['W'],
    };
  }
  const bear = /^synthetic bear (\d+)$/.exec(key);
  if (bear?.[1] !== undefined) {
    const n = Number(bear[1]);
    return {
      ...common,
      name: `SYNTHETIC Bear ${bear[1]}`,
      mana_cost: '{1}{W}',
      cmc: 2,
      type_line: 'Creature — Bear',
      oracle_text: n % 4 === 0 ? 'Draw a card.' : '',
      power: '2',
      toughness: '2',
      colors: ['W'],
      color_identity: ['W'],
    };
  }
  return undefined;
}

async function answerCollection(route: Route): Promise<void> {
  const request = route.request();
  if (request.method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: CORS });
    return;
  }
  const body = request.postDataJSON() as { identifiers: { name: string }[] };
  const data: Record<string, unknown>[] = [];
  const notFound: { name: string }[] = [];
  for (const { name } of body.identifiers) {
    const card = syntheticCard(name);
    if (card === undefined) notFound.push({ name });
    else data.push(card);
  }
  await route.fulfill({
    status: 200,
    headers: CORS,
    contentType: 'application/json',
    body: JSON.stringify({ object: 'list', not_found: notFound, data }),
  });
}

export async function fakeScryfall(page: Page): Promise<void> {
  await page.route('https://api.scryfall.com/**', (route) => {
    if (new URL(route.request().url()).pathname === '/cards/collection')
      return answerCollection(route);
    // Name lookups for names the fake does not know (the fuzzy fallback) and card images: not found.
    return route.fulfill({
      status: 404,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({
        object: 'error',
        status: 404,
        code: 'not_found',
        details: 'No match.',
      }),
    });
  });
}
