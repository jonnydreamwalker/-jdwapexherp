/**
 * Small bottom-right cookie / cart notice.
 * Frost, emerald border, light magnification — matches nav dropdown.
 */
(function () {
  var CONSENT_KEY = "apex_consent";
  var HIDE_KEY = "apex_consent_hide";
  var YEAR = 365 * 24 * 60 * 60;

  function readCookie(name) {
    var m = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")
    );
    return m ? decodeURIComponent(m[1]) : "";
  }

  function writeCookie(name, value, maxAge) {
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; path=/" +
      "; max-age=" +
      maxAge +
      "; SameSite=Lax" +
      secure;
  }

  function getConsent() {
    try {
      var ls = localStorage.getItem(CONSENT_KEY);
      if (ls === "accepted" || ls === "declined") return ls;
    } catch (e) {}
    var c = readCookie(CONSENT_KEY);
    if (c === "accepted" || c === "declined") return c;
    return "";
  }

  function setConsent(value) {
    try {
      localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {}
    writeCookie(CONSENT_KEY, value, YEAR);
  }

  function shouldHideForever() {
    try {
      if (localStorage.getItem(HIDE_KEY) === "1") return true;
    } catch (e) {}
    return readCookie(HIDE_KEY) === "1";
  }

  function setHideForever(on) {
    if (!on) return;
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch (e) {}
    writeCookie(HIDE_KEY, "1", YEAR);
  }

  function ensureStyles() {
    if (document.getElementById("apex-consent-css")) return;
    var s = document.createElement("style");
    s.id = "apex-consent-css";
    s.textContent =
      "#apex-cookie-banner{position:fixed;right:1rem;bottom:1rem;z-index:100;width:min(20.5rem,calc(100vw - 1.5rem));pointer-events:none}" +
      "#apex-cookie-banner.is-open{pointer-events:auto}" +
      "#apex-cookie-banner .apex-cookie-panel{" +
      "background:rgba(9,9,11,.32);backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%);" +
      "border:1px solid rgba(16,185,129,.38);border-radius:.9rem;padding:1rem 1.05rem;" +
      "box-shadow:0 16px 40px -12px rgba(0,0,0,.55),0 0 0 1px rgba(16,185,129,.08);" +
      "transform:scale(.94) translateY(10px);opacity:0;transition:opacity .18s ease,transform .18s ease}" +
      "#apex-cookie-banner.is-open .apex-cookie-panel{transform:scale(1) translateY(0);opacity:1}" +
      "#apex-cookie-banner h3{color:#34d399;font-weight:800;font-size:.875rem;letter-spacing:-.02em;margin:0 0 .4rem}" +
      "#apex-cookie-banner p{color:#a1a1aa;font-size:.72rem;line-height:1.4;margin:0 0 .65rem}" +
      "#apex-cookie-banner label{display:flex;align-items:center;gap:.4rem;color:#d4d4d8;font-size:.68rem;margin:0 0 .7rem;cursor:pointer;user-select:none}" +
      "#apex-cookie-banner input[type=checkbox]{accent-color:#10b981;width:.9rem;height:.9rem;flex-shrink:0}" +
      "#apex-cookie-banner .apex-cookie-actions{display:flex;gap:.4rem}" +
      "#apex-cookie-banner button{border:0;border-radius:.65rem;font-weight:700;font-size:.65rem;text-transform:uppercase;letter-spacing:.03em;padding:.55rem .7rem;cursor:pointer;transition:transform .15s ease,background .15s ease;flex:1 1 0}" +
      "#apex-cookie-banner button:hover{transform:scale(1.05)}" +
      "#apex-cookie-banner .btn-accept{background:#059669;color:#fff}" +
      "#apex-cookie-banner .btn-accept:hover{background:#10b981}" +
      "#apex-cookie-banner .btn-decline{background:rgba(39,39,42,.7);color:#e4e4e7;border:1px solid rgba(63,63,70,.85)}" +
      "#apex-cookie-banner .btn-decline:hover{background:rgba(63,63,70,.8)}";
    document.head.appendChild(s);
  }

  function closeBanner(root) {
    if (!root) return;
    root.classList.remove("is-open");
    setTimeout(function () {
      if (root.parentNode) root.parentNode.removeChild(root);
    }, 200);
  }

  function showBanner() {
    if (document.getElementById("apex-cookie-banner")) return;
    ensureStyles();
    var root = document.createElement("div");
    root.id = "apex-cookie-banner";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-labelledby", "apex-cookie-title");
    root.innerHTML =
      '<div class="apex-cookie-panel">' +
      '<h3 id="apex-cookie-title">Cookies & cart</h3>' +
      "<p>We store your cart and basic preferences on this device so shopping stays smooth. No ad trackers.</p>" +
      '<label><input type="checkbox" id="apex-cookie-hide"> Don\'t show again</label>' +
      '<div class="apex-cookie-actions">' +
      '<button type="button" class="btn-accept" data-accept>Accept</button>' +
      '<button type="button" class="btn-decline" data-decline>Decline</button>' +
      "</div></div>";

    document.body.appendChild(root);
    requestAnimationFrame(function () {
      root.classList.add("is-open");
    });

    function finish(value) {
      var hide = document.getElementById("apex-cookie-hide");
      setConsent(value);
      if (hide && hide.checked) setHideForever(true);
      closeBanner(root);
    }

    root.querySelector("[data-accept]").addEventListener("click", function () {
      finish("accepted");
    });
    root.querySelector("[data-decline]").addEventListener("click", function () {
      finish("declined");
    });
  }

  function boot() {
    if (getConsent()) return;
    if (shouldHideForever()) return;
    showBanner();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.ApexConsent = {
    get: getConsent,
    accepted: function () {
      return getConsent() === "accepted";
    }
  };
})();
