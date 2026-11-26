// Smoke tests of the card, loaded from the built bundle.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  setupDom,
  infoLogs,
  created,
  HASS,
  CARDS,
  wait,
  createCard,
  restyled,
  stackOf,
  rootOf,
  haCardsOf,
} from "./helpers.mjs";

setupDom();

const assertMerged = (haCard) => {
  assert.equal(haCard.style.background, "transparent");
  assert.equal(haCard.style.borderStyle, "none", "border");
  assert.equal(
    haCard.style.borderRadius,
    "var(--ha-card-border-radius, 0px)",
    "corners",
  );
  assert.equal(haCard.style.boxShadow, "none");
};

test("registers the card and logs its version", () => {
  assert.ok(
    customElements.get("stack-in-card"),
    "stack-in-card is not defined",
  );
  assert.ok(
    window.customCards.some((c) => c.type === "stack-in-card"),
    "card is not added to window.customCards",
  );
  // `dev` locally, the release tag when the release workflow builds it
  assert.ok(
    infoLogs.some((log) =>
      /Stack In Card %c (dev|v\d+\.\d+\.\d+(-beta-\d+)?) /.test(log),
    ),
    infoLogs.join("\n"),
  );
});

test("shows a weather card above three buttons in the card picker", () => {
  const entry = window.customCards.find((c) => c.type === "stack-in-card");
  assert.equal(entry.preview, true);

  const Card = customElements.get("stack-in-card");
  const hass = {
    states: {
      "sensor.temperature": {},
      "weather.home": {},
      "light.kitchen": {},
      "switch.heater": {},
      "light.bedroom": {},
      "light.hall": {},
      "weather.cabin": {},
    },
  };
  // The picker passes the entities on the dashboard first, then the rest
  assert.deepEqual(
    Card.getStubConfig(
      hass,
      ["light.hall", "sensor.temperature", "weather.cabin"],
      [],
    ),
    {
      cards: [
        { type: "weather-forecast", entity: "weather.cabin" },
        {
          type: "horizontal-stack",
          cards: [
            { type: "button", entity: "light.hall" },
            { type: "button", entity: "light.kitchen" },
            { type: "button", entity: "switch.heater" },
          ],
        },
      ],
    },
  );

  // No weather card without a weather entity, and buttons with only an icon
  // when there are too few lights and switches
  const stub = Card.getStubConfig({ states: { "light.kitchen": {} } }, [], []);
  assert.equal(stub.cards.length, 1);
  const buttons = stub.cards[0].cards;
  assert.equal(buttons.length, 3);
  assert.deepEqual(buttons[0], { type: "button", entity: "light.kitchen" });
  assert.equal(buttons[1].entity, undefined);
  assert.match(buttons[1].icon, /^mdi:/);
});

test("rejects configs without cards or with an unknown mode", () => {
  const card = document.createElement("stack-in-card");
  assert.throws(
    () => card.setConfig({ type: "custom:stack-in-card" }),
    /cards/,
  );
  assert.throws(
    () => card.setConfig({ type: "custom:stack-in-card", cards: {} }),
    /cards/,
  );
  assert.throws(
    () => card.setConfig({ cards: CARDS, mode: "diagonal" }),
    /Unknown mode: diagonal/,
  );
});

test("stacks the cards vertically by default, under the title", async () => {
  const card = await createCard({ title: "My stack" });
  const stack = stackOf(card);
  assert.equal(stack.localName, "hui-vertical-stack-card");
  assert.deepEqual(stack.config, { type: "vertical-stack", cards: CARDS });
  assert.equal(
    card.shadowRoot.querySelector("ha-card").getAttribute("header"),
    "My stack",
  );
  card.remove();
});

test("stacks the cards horizontally, without a title", async () => {
  const card = await createCard({ mode: "horizontal" });
  assert.equal(stackOf(card).localName, "hui-horizontal-stack-card");
  assert.equal(
    card.shadowRoot.querySelector("ha-card").hasAttribute("header"),
    false,
  );
  card.remove();
});

test("passes hass to the stack, also when it arrives while the stack is created", async () => {
  const card = document.createElement("stack-in-card");
  card.setConfig({ cards: CARDS });
  document.body.appendChild(card);
  // The card helpers take 5 ms to load
  await wait(1);
  card.hass = HASS;
  await wait(20);
  const stack = stackOf(card);
  assert.equal(stack.hass, HASS);

  const newHass = { states: { "sun.sun": { state: "above_horizon" } } };
  card.hass = newHass;
  assert.equal(stack.hass, newHass);
  card.remove();
});

test("passes preview to the stack", async () => {
  const card = await createCard();
  assert.equal(stackOf(card).preview, false);
  card.preview = true;
  assert.equal(stackOf(card).preview, true);
  card.remove();
});

test("merges the cards: no background, border, corners, shadow or spacing", async () => {
  const card = await createCard();
  const stack = stackOf(card);
  for (const haCard of haCardsOf(stack)) assertMerged(haCard);
  assert.equal(rootOf(stack).style.gap, "0");
  assert.equal(rootOf(stack).style.padding, "");
  for (const huiCard of stack.cards) {
    assert.equal(huiCard.style.margin, "0px");
    assert.equal(huiCard.firstElementChild.style.margin, "0px");
  }
  card.remove();
});

test("merges the cards from their first paint with HA's CSS variables", async () => {
  const card = await createCard();
  const wrapper = card.shadowRoot.querySelector("ha-card > .stack");
  assert.equal(wrapper.firstElementChild, stackOf(card));
  const css = card.shadowRoot.querySelector("style").textContent;
  const rule = /\.stack\s*{([^}]*)}/.exec(css)?.[1] ?? "";
  for (const [name, value] of [
    ["--ha-card-background", "transparent"],
    ["--ha-card-border-width", "0px"],
    ["--ha-card-border-radius", "0px"],
    ["--ha-card-box-shadow", "none"],
    ["--stack-card-gap", "0px"],
    ["--vertical-stack-card-gap", "0px"],
    ["--horizontal-stack-card-gap", "0px"],
    ["--grid-card-gap", "0px"],
  ]) {
    assert.match(rule, new RegExp(`${name}:\\s*${value};`), name);
  }
  card.remove();
});

test("doesn't clip the cards inside, so their menus can reach outside", async () => {
  const card = await createCard();
  const css = card.shadowRoot.querySelector("style").textContent;
  assert.doesNotMatch(css, /overflow/);
  card.remove();
});

// The corners each card in a stack gets
const radiusOf = (element) =>
  element.style.getPropertyValue("--ha-card-border-radius");

// A card whose own ha-card has 12px corners, like the default theme
const createRoundCard = async (config) => {
  const card = await createCard(config);
  card.shadowRoot.querySelector("ha-card").style.borderRadius = "12px";
  await restyled();
  return card;
};

test("gives the cards in the corners its rounded corners", async () => {
  const card = await createRoundCard({
    cards: [
      { type: "test" },
      { type: "test" },
      { type: "horizontal-stack", cards: [CARDS[0], CARDS[0], CARDS[0]] },
    ],
  });
  const [top, middle, bottom] = stackOf(card).cards;
  assert.equal(radiusOf(top), "12px 12px 0px 0px");
  assert.equal(radiusOf(middle), "0px 0px 0px 0px");
  assert.equal(radiusOf(bottom), "0px 0px 12px 12px");

  // A row of cards at the bottom: the outer ones get one corner each
  const row = bottom.firstElementChild.cards;
  assert.deepEqual(row.map(radiusOf), [
    "0px 0px 0px 12px",
    "0px 0px 0px 0px",
    "0px 0px 12px 0px",
  ]);
  card.remove();
});

test("rounds the corners of a horizontal stack, and not under a title", async () => {
  const horizontal = await createRoundCard({ mode: "horizontal" });
  assert.deepEqual(stackOf(horizontal).cards.map(radiusOf), [
    "12px 0px 0px 12px",
    "0px 12px 12px 0px",
  ]);
  horizontal.remove();

  const titled = await createRoundCard({ title: "Living room" });
  assert.deepEqual(stackOf(titled).cards.map(radiusOf), [
    "0px 0px 0px 0px",
    "0px 0px 12px 12px",
  ]);
  titled.remove();

  const single = await createRoundCard({ cards: [CARDS[0]] });
  assert.equal(radiusOf(stackOf(single).cards[0]), "12px 12px 12px 12px");
  single.remove();

  // In a grid it isn't known which card is in which corner
  const grid = await createRoundCard({
    cards: [{ type: "grid", cards: CARDS }],
  });
  const gridCards = stackOf(grid).cards[0].firstElementChild.cards;
  assert.deepEqual(gridCards.map(radiusOf), [
    "0px 0px 0px 0px",
    "0px 0px 0px 0px",
  ]);
  grid.remove();
});

test("merges cards that render late", async () => {
  const card = await createCard();
  const late = document.createElement("hui-card");
  late.config = { type: "test" };
  rootOf(stackOf(card)).appendChild(late);
  await restyled();
  assertMerged(late.firstElementChild.shadowRoot.querySelector("ha-card"));
  card.remove();
});

test("can't be told to keep anything", async () => {
  // `keep` from the original card, and the CSS flags it read
  const card = await createCard({
    keep: {
      background: true,
      border: true,
      border_radius: true,
      box_shadow: true,
      margin: true,
      outer_padding: true,
    },
    cards: [{ type: "test", keep: { background: true, border: true } }],
  });
  await restyled();
  const stack = stackOf(card);
  for (const haCard of haCardsOf(stack)) assertMerged(haCard);
  assert.equal(rootOf(stack).style.gap, "0");
  assert.equal(rootOf(stack).style.padding, "");
  card.remove();
});

test("merges nested stacks and nested stack-in-cards", async () => {
  const card = await createCard({
    cards: [
      { type: "horizontal-stack", cards: CARDS },
      { type: "custom:stack-in-card", cards: CARDS },
    ],
  });
  await restyled();
  const [nestedStack, nestedStackInCard] = stackOf(card).cards.map(
    (huiCard) => huiCard.firstElementChild,
  );

  assert.equal(rootOf(nestedStack).style.gap, "0");
  for (const haCard of haCardsOf(nestedStack)) assertMerged(haCard);

  // Its own ha-card merges into this one, and it merges its own cards
  assert.equal(nestedStackInCard.style.margin, "0px");
  assertMerged(nestedStackInCard.shadowRoot.querySelector("ha-card"));
  for (const haCard of haCardsOf(stackOf(nestedStackInCard))) {
    assertMerged(haCard);
  }
  card.remove();
});

test("reports the size of the stack", async () => {
  const card = await createCard({
    cards: [
      { type: "test", size: 2 },
      { type: "test", size: 3 },
    ],
  });
  assert.equal(await card.getCardSize(), 5);
  card.remove();

  const horizontal = await createCard({
    mode: "horizontal",
    cards: [
      { type: "test", size: 2 },
      { type: "test", size: 3 },
    ],
  });
  assert.equal(await horizontal.getCardSize(), 3);
  horizontal.remove();
});

test("only shows the stack of the latest config", async () => {
  const card = document.createElement("stack-in-card");
  card.setConfig({ cards: CARDS });
  card.setConfig({ cards: CARDS, mode: "horizontal" });
  card.hass = HASS;
  document.body.appendChild(card);
  await wait(20);
  assert.equal(stackOf(card).localName, "hui-horizontal-stack-card");
  card.remove();
});

test("rebuilds the stack on ll-rebuild", async () => {
  const card = await createCard();
  const stack = stackOf(card);
  const count = created.length;
  stack.dispatchEvent(new Event("ll-rebuild"));
  await wait(20);
  await card.updateComplete;

  const rebuilt = stackOf(card);
  assert.notEqual(rebuilt, stack);
  assert.ok(created.length > count, "no new stack was created");
  assert.equal(rebuilt.hass, HASS);
  assert.equal(rootOf(rebuilt).style.gap, "0");
  card.remove();
});
