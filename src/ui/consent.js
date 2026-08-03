(function () {
  var CONSENT_KEY = "cast_analytics_consent";

  function updateConsent(status) {
    if (typeof window.gtag !== "function") return;
    window.gtag("consent", "update", { analytics_storage: status });
  }

  var stored = localStorage.getItem(CONSENT_KEY);
  if (stored === "granted") {
    updateConsent("granted");
    return;
  }
  if (stored === "denied") {
    return;
  }

  function showBanner() {
    var style = document.createElement("style");
    style.textContent =
      ".cast-consent-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;" +
      "background:var(--panel,#fffcf6);color:var(--ink,#182126);" +
      "border:1px solid var(--line,rgba(24,33,38,.12));border-radius:10px;" +
      "padding:14px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;" +
      "justify-content:space-between;font:14px/1.4 var(--body,system-ui,sans-serif);" +
      "max-width:720px;margin:0 auto;box-shadow:0 8px 24px rgba(24,33,38,.18)}" +
      ".cast-consent-banner p{margin:0;flex:1 1 260px}" +
      ".cast-consent-banner a{color:var(--accent,#bf4a2b)}" +
      ".cast-consent-actions{display:flex;gap:8px;flex:0 0 auto}" +
      ".cast-consent-actions button{border:1px solid var(--line,rgba(24,33,38,.12));" +
      "background:transparent;color:var(--ink,#182126);border-radius:6px;padding:8px 14px;" +
      "font:inherit;cursor:pointer}" +
      ".cast-consent-actions button.cast-consent-accept{background:var(--accent,#bf4a2b);" +
      "border-color:var(--accent,#bf4a2b);color:#fff}";
    document.head.appendChild(style);

    var banner = document.createElement("div");
    banner.className = "cast-consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.innerHTML =
      "<p>We use Google Analytics to see how Cast is used. Nothing is tracked until you accept. " +
      '<a href="/privacy.html" target="_blank" rel="noreferrer">Privacy policy</a></p>' +
      '<div class="cast-consent-actions">' +
      '<button type="button" class="cast-consent-reject">Reject</button>' +
      '<button type="button" class="cast-consent-accept">Accept</button>' +
      "</div>";
    document.body.appendChild(banner);

    banner.querySelector(".cast-consent-accept").addEventListener("click", function () {
      localStorage.setItem(CONSENT_KEY, "granted");
      updateConsent("granted");
      banner.remove();
    });
    banner.querySelector(".cast-consent-reject").addEventListener("click", function () {
      localStorage.setItem(CONSENT_KEY, "denied");
      banner.remove();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showBanner);
  } else {
    showBanner();
  }
})();
