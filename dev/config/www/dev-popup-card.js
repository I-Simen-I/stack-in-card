// Test helper: a card with an open menu below it, positioned like the
// menus many custom cards draw themselves (mini-media-player without
// mwc-menu, for example), to see whether stack-in-card cuts it off.
//
//   type: custom:dev-popup-card
class DevPopupCard extends HTMLElement {
  setConfig() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>
        .row { position: relative; padding: 16px; }
        .menu {
          position: absolute;
          right: 16px;
          top: calc(100% - 8px);
          z-index: 1000;
          width: 160px;
          padding: 8px 0;
          border-radius: 8px;
          background: var(--card-background-color, #fff);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
        }
        .menu div { padding: 8px 16px; }
      </style>
      <ha-card>
        <div class="row">Custom menu (always open)</div>
        <div class="menu"><div>Option 1</div><div>Option 2</div><div>Option 3</div><div>Option 4</div></div>
      </ha-card>`;
    this.shadowRoot.querySelector("ha-card").style.position = "relative";
  }

  getCardSize() {
    return 1;
  }
}

customElements.define("dev-popup-card", DevPopupCard);
