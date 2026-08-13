(function () {
  class TracecaseWidget extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const baseUrl = this.getAttribute("base-url");
      const projectKey = this.getAttribute("project-key");
      if (!baseUrl || !projectKey) {
        console.error("Tracecase requires base-url and project-key attributes.");
        return;
      }
      const root = this.attachShadow({ mode: "closed" });
      root.innerHTML = `<style>:host{all:initial;position:fixed;right:22px;bottom:22px;z-index:2147483647}button{display:flex;align-items:center;gap:9px;border:1px solid #4b3025;border-radius:999px;background:#342119;color:#fffaf2;font:650 14px/1 system-ui;padding:13px 18px;box-shadow:0 14px 34px rgba(54,31,20,.26);cursor:pointer}button:focus-visible{outline:3px solid #d69068;outline-offset:3px}dialog{border:0;padding:0;width:min(420px,calc(100vw - 20px));height:min(680px,calc(100vh - 20px));border-radius:24px;overflow:hidden;box-shadow:0 32px 90px rgba(54,31,20,.32);background:#fbf5ea}dialog::backdrop{background:rgba(38,24,18,.24);backdrop-filter:blur(3px)}iframe{border:0;width:100%;height:100%;display:block}</style><button type="button" aria-label="Open support chat" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4V5Z"/><path d="M8 9h8M8 12h5"/></svg>Help</button><dialog><iframe title="Tracecase support chat" loading="lazy" sandbox="allow-scripts allow-forms allow-same-origin"></iframe></dialog>`;
      const button = root.querySelector("button");
      const dialog = root.querySelector("dialog");
      const frame = root.querySelector("iframe");
      const page = window.location.pathname + window.location.search;
      frame.src = `${baseUrl.replace(/\/$/, "")}/intake?embed=1&projectKey=${encodeURIComponent(projectKey)}&page=${encodeURIComponent(page)}`;
      const open = () => { dialog.showModal(); button.setAttribute("aria-expanded", "true"); };
      const close = () => { dialog.close(); button.setAttribute("aria-expanded", "false"); };
      button.addEventListener("click", open);
      dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
      dialog.addEventListener("close", () => button.setAttribute("aria-expanded", "false"));
      window.addEventListener("message", (event) => { if (event.origin === new URL(baseUrl).origin && event.data === "tracecase:close") close(); });
    }
  }
  if (!customElements.get("tracecase-widget")) customElements.define("tracecase-widget", TracecaseWidget);
})();
