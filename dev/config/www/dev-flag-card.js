// Test helper: renders a card with CSS variables set on it, like card-mod
// or button-card styles would, to test `--keep-background` and
// `--keep-border`. The variables are inherited by the card's ha-card.
//
//   type: custom:dev-flag-card
//   style:
//     --keep-background: "true"
//   card:
//     type: entities
//     ...
class DevFlagCard extends HTMLElement {
  setConfig(config) {
    this.style.display = "block";
    for (const [name, value] of Object.entries(config.style ?? {})) {
      this.style.setProperty(name, value);
    }
    window.loadCardHelpers().then((helpers) => {
      this._card = helpers.createCardElement(config.card);
      if (this._hass) this._card.hass = this._hass;
      this.replaceChildren(this._card);
    });
  }

  set hass(hass) {
    this._hass = hass;
    if (this._card) this._card.hass = hass;
  }

  getCardSize() {
    return this._card?.getCardSize?.() ?? 1;
  }
}

customElements.define("dev-flag-card", DevFlagCard);
