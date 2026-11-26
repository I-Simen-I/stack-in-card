# Local test environment

A local Home Assistant in Docker with demo entities and a dashboard covering
the card's options. The built card in `dist/` is mounted straight in, so
nothing has to be released to test a change.

## Usage

```bash
yarn build          # dist/ must exist before the container starts
yarn ha:up          # start Home Assistant on http://localhost:8124
yarn watch          # rebuild on every change, then hard refresh the browser
```

The first time, Home Assistant asks you to create a user (onboarding). After
that, the login is skipped when opened from localhost.

It runs on port 8124 and in its own Compose project (`stack-in-card`), so it
can run next to simple-weather-card's test environment on 8123.

Open the **Stack in card** dashboard in the sidebar. Most cards have Home
Assistant's own stack with the same cards next to them, to compare.

```bash
yarn ha:logs        # follow the Home Assistant log
yarn ha:down        # stop the container
```

## Files

- `config/configuration.yaml`: demo integration, card loaded via
  `frontend.extra_module_url`, and the dashboard below
- `config/dashboards/stack.yaml`: test cards (the README images, both
  modes next to Home Assistant's own stacks, nested stacks, content
  reaching outside the card)
- `config/www/dev-popup-card.js`: a card with an always open menu, drawn
  like custom cards draw theirs, for the Overflow view

Everything else Home Assistant writes to `config/` is ignored by git. Delete
it to start over from a fresh install.

## README images

Set your profile language to English and collapse the sidebar. Take the
cards with Cmd+Shift+4 (drag around them).

- `images/main.png`: the **Compare** view, the card next to Home
  Assistant's vertical stack with the same cards.
- `images/demo_1.png`: the **Gallery** view, the card with the cards
  people stack most.
- `images/demo_2.png`: the first two cards in the **Basics** view, the
  vertical card next to Home Assistant's vertical stack.
- `images/demo_3.png`: the horizontal card and Home Assistant's horizontal
  stack below it, in the **Basics** view.

The README's examples show the same cards as these views.

- `images/editor.png`: edit the Stack In Card in the **Compare** view and
  take the editor dialog.

## Releasing

1. Go to **Actions → Release → Run workflow** on `master`, pick the version
   bump and whether it's a beta.
2. The workflow works out the next version from the tags, checks and builds
   the card, and creates a **draft** release with generated release notes.
3. Review the draft, add highlights at the top if you like, and press
   **Publish**. The tag is created then, and Marketplace (HACS) users get the update.

Betas are tagged `vX.Y.Z-beta-N` and only reach users who enabled beta
versions in the Marketplace (HACS).

Release notes are grouped by pull request label. Labels are set from the
branch name: `feat/…` → Features, `fix/…` → Fixes, `chore/…`, `ci/…`,
`refactor/…` → Maintenance, `docs/…` → Maintenance. Dependabot's pull
requests go under Dependencies.

The version in `package.json` is a placeholder (`0.0.0-dev`). The card's
version comes from the tag: the release workflow passes it to the build as
`CARD_VERSION`, and local builds show `dev`.
