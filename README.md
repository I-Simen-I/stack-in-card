# Stack In Card

[![Release](https://img.shields.io/github/release/I-Simen-I/stack-in-card?style=for-the-badge)](https://github.com/I-Simen-I/stack-in-card/releases/latest)
[![Last commit](https://img.shields.io/github/last-commit/I-Simen-I/stack-in-card?style=for-the-badge)](https://github.com/I-Simen-I/stack-in-card/commits/master)
[![Marketplace](https://img.shields.io/badge/Marketplace%20%2F%20HACS-Custom-orange.svg?style=for-the-badge)](#marketplace-recommended)

Group several cards into one card on your [Home Assistant](https://www.home-assistant.io/) dashboards, without the borders, shadows and gaps between them.

![Stack In Card with an entities card, a glance card and two buttons](docs/Example.png)

> A fork of [stack-in-card](https://github.com/custom-cards/stack-in-card) by [@RomRider](https://github.com/RomRider), kept up to date with current Home Assistant releases.

## Features

- **One card from many**: stack any cards vertically or horizontally, and they look like one card
- **Nested stacks**: horizontal and vertical stacks inside the card are merged too
- **Visual editor** with Home Assistant's own card tabs
- **Keep what you want**: background, border, rounded corners, shadow or spacing, for all cards or per card
- A drop-in replacement for [vertical-stack-in-card](https://github.com/ofekashery/vertical-stack-in-card) and `horizontal-stack-in-card`

## Installation

Requires Home Assistant 2026.4 or newer.

### Marketplace (recommended)

From Home Assistant 2026.11, HACS is built in as the **Marketplace** (Settings → Marketplace). On older versions, use [HACS](https://hacs.xyz/); the steps are the same.

[![Open your Home Assistant instance and open this repository in the Marketplace.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=I-Simen-I&repository=stack-in-card&category=plugin)

1. Click the button above, or add `https://github.com/I-Simen-I/stack-in-card` as a custom repository of type **Dashboard**. In the Marketplace, adding custom repositories needs a connection to GitHub.
2. Download **Stack In Card**.
3. Reload your browser.

### Manual

1. Download `stack-in-card.js` from the [latest release](https://github.com/I-Simen-I/stack-in-card/releases/latest) and copy it to your `config/www` folder. If the folder doesn't exist, create it and restart Home Assistant, which only serves `/local/` from a folder that existed when it started.
2. Add it as a resource: Settings → Dashboards → ⋮ → Resources → Add resource, with URL `/local/stack-in-card.js` and type **JavaScript module**.
3. Reload your browser.

### Migrating from the original card

1. Remove the original Stack In Card in the Marketplace (or HACS), or its file and resource if you installed it manually.
2. Install this card as described above.
3. Existing card configs keep working. Two things look different, because they were broken in the original card on newer Home Assistant versions:
   - Borders around the cards in the stack are removed. Keep them with `keep: { border: true }`.
   - The gap between the cards is removed, unless `keep: { margin: true }` is set.

## Configuration

Add **Stack In Card** from the card picker; it starts with a weather card above three buttons side by side.

### Visual editor

The editor has the direction (vertical or horizontal), the title and the cards, with the same tabs as Home Assistant's own stacks to add, move, copy and delete cards and edit each one. **Keep the cards' own look** has a switch for each [keep](#keep) option. The editor is in English and Norwegian.

### YAML

Add the cards to stack under `cards`, as you would in a vertical stack.

```yaml
type: custom:stack-in-card
title: Living room
cards:
  - type: entities
    entities:
      - light.ceiling_lights
  - type: glance
    entities:
      - sensor.outside_temperature
      - sensor.outside_humidity
```

#### Card options

| Name    | Type   | Default    | Description                                            |
| ------- | ------ | ---------- | ------------------------------------------------------ |
| `type`  | string | _required_ | `custom:stack-in-card`                                 |
| `cards` | list   | _required_ | The cards to stack                                     |
| `mode`  | string | `vertical` | `vertical` or `horizontal`                             |
| `title` | string |            | Title above the cards                                  |
| `keep`  | object |            | What to keep of the cards' own look, see [Keep](#keep) |

#### Keep

By default the cards in the stack lose their background, border, rounded corners, shadow and the space between them. `keep` brings them back for **all** the cards:

| Name            | Type    | Default          | Description                                         |
| --------------- | ------- | ---------------- | --------------------------------------------------- |
| `background`    | boolean | `false`          | Keep the background                                 |
| `border`        | boolean | `false`          | Keep the border                                     |
| `border_radius` | boolean | `false`          | Keep the rounded corners                            |
| `box_shadow`    | boolean | `false`          | Keep the shadow                                     |
| `margin`        | boolean | `false`          | Keep the space between the cards                    |
| `outer_padding` | boolean | same as `margin` | Add 8px of space around the cards, inside the stack |

To keep the background or border of **one** card only, set the CSS variable `--keep-background: true` or `--keep-border: true` on that card, with [card-mod](https://github.com/thomasloven/lovelace-card-mod) or the card's own styles (like [button-card](https://github.com/custom-cards/button-card)'s).

## Examples

### Horizontal

```yaml
type: custom:stack-in-card
mode: horizontal
cards:
  - type: button
    entity: light.kitchen_lights
  - type: button
    entity: light.bed_light
```

### Nested stacks

Stacks inside the card are merged too:

```yaml
type: custom:stack-in-card
title: My Stack In Card
cards:
  - type: horizontal-stack
    cards:
      - type: button
        entity: sun.sun
      - type: button
        entity: sun.sun
  - type: entities
    entities:
      - sun.sun
```

### Keep the space between the cards

```yaml
type: custom:stack-in-card
keep:
  margin: true
  border_radius: true
cards:
  - type: button
    entity: light.kitchen_lights
  - type: button
    entity: light.bed_light
```

### Keep the background of one card

With button-card:

```yaml
type: custom:stack-in-card
cards:
  - type: custom:button-card
    entity: sun.sun
    color_type: card
    styles:
      card:
        - --keep-background: "true"
  - type: entities
    entities:
      - sun.sun
```

## Troubleshooting

- **"Custom element doesn't exist: stack-in-card"**: the card isn't loaded. Check that it's installed in the Marketplace (or HACS), or added as a resource if you installed it manually, then reload your browser.
- **Changes don't show after an update**: your browser is using a cached copy. Reload without cache (Ctrl+Shift+R or Cmd+Shift+R), or clear the cache in the Home Assistant app.
- **A card still has a background or border**: the card is styled once it has rendered, and again after half a second. Custom cards that take longer to load can be missed; reload the page. Cards inside a nested `custom:stack-in-card` follow that card's `keep`, not the outer one's.

Still stuck? [Open an issue](https://github.com/I-Simen-I/stack-in-card/issues).

## Development

Requires Node 24 or newer and Yarn 4 via Corepack. Node 25 and newer no longer include Corepack, so install it separately (for example `brew install corepack` or `npm install -g corepack`) and run `corepack enable`.

```bash
yarn install     # install dependencies
yarn build       # build dist/stack-in-card.js
yarn watch       # rebuild on changes
yarn typecheck   # TypeScript
yarn lint        # ESLint and Prettier
yarn test        # smoke tests of the built card
yarn ha:up       # local Home Assistant with demo data on http://localhost:8124 (needs Docker and a build)
```

The local test environment and the release process are described in [`dev/README.md`](dev/README.md).

Built with TypeScript, Lit 3 and webpack.

## License

[MIT](LICENSE)
