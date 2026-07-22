/** JDW owned reviews — data stays on ApexFreePort; only approved show */
(function (global) {
  var API = global.APEX_API_BASE || "http://3.14.14.127:3000";
  API = API.replace(/\/$/, "");

  function starsHtml(n) {
    n = Math.round(Number(n) || 0);
    var s = "";
    for (var i = 1; i <= 5; i++) s += i <= n ? "★" : "☆";
    return s;
  }

  async function loadPublic() {
    var res = await fetch(API + "/api/reviews", { mode: "cors", cache: "no-store" });
    if (!res.ok) throw new Error("reviews");
    return res.json();
  }

  async function renderSummary(selector) {
    var el = document.querySelector(selector || "#jdw-review-summary");
    if (!el) return;
    try {
      var data = await loadPublic();
      var avg = data.average || 0;
      var count = data.count || 0;
      el.innerHTML =
        '<div class="text-center">' +
        '<div class="text-amber-400 text-2xl tracking-widest">' +
        starsHtml(avg) +
        "</div>" +
        '<p class="text-emerald-400 font-bold mt-1">' +
        avg.toFixed(1) +
        " / 5" +
        (count ? " · " + count + " review" + (count === 1 ? "" : "s") : "") +
        "</p></div>";
      var list = document.querySelector("#jdw-review-list");
      if (list && data.reviews && data.reviews.length) {
        list.innerHTML = data.reviews
          .slice(0, 6)
          .map(function (r) {
            return (
              '<blockquote class="bg-zinc-900 border border-emerald-900/50 rounded-2xl p-5 text-sm">' +
              '<div class="text-amber-400 mb-2">' +
              starsHtml(r.stars) +
              "</div>" +
              '<p class="text-zinc-300">"' +
              String(r.text || "").replace(/</g, "&lt;") +
              '"</p>' +
              '<p class="text-zinc-500 text-xs mt-3">— ' +
              String(r.name || "Customer").replace(/</g, "&lt;") +
              "</p></blockquote>"
            );
          })
          .join("");
      }
    } catch (e) {
      el.innerHTML = '<p class="text-zinc-500 text-sm text-center">Reviews loading soon.</p>';
    }
  }

  function ensurePopup() {
    if (document.getElementById("jdw-review-modal")) return;
    var wrap = document.createElement("div");
    wrap.id = "jdw-review-modal";
    wrap.className = "fixed inset-0 z-[80] hidden items-center justify-center p-4 bg-black/80";
    wrap.innerHTML =
      '<div class="bg-zinc-900 border border-emerald-900 rounded-2xl max-w-md w-full p-6 text-white">' +
      '<div class="flex justify-between items-center mb-4">' +
      '<h3 class="text-lg font-bold text-emerald-400">Rate your experience</h3>' +
      '<button type="button" id="jdw-review-close" class="text-2xl leading-none">&times;</button></div>' +
      '<p class="text-zinc-500 text-xs mb-4">Reviews are moderated before they appear on the site.</p>' +
      '<form id="jdw-review-form" class="space-y-3">' +
      '<label class="block text-xs text-zinc-500">Stars</label>' +
      '<select name="stars" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm" required>' +
      "<option value=\"5\">5 — Excellent</option>" +
      "<option value=\"4\">4 — Good</option>" +
      "<option value=\"3\">3 — OK</option>" +
      "<option value=\"2\">2 — Poor</option>" +
      "<option value=\"1\">1 — Bad</option></select>" +
      '<label class="block text-xs text-zinc-500">Name (optional)</label>' +
      '<input name="name" maxlength="40" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm" placeholder="First name">' +
      '<label class="block text-xs text-zinc-500">Review</label>' +
      '<textarea name="text" required maxlength="800" rows="3" class="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm" placeholder="How was your experience?"></textarea>' +
      '<button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-500 font-bold uppercase text-xs py-3 rounded-xl">Submit for review</button>' +
      '<p id="jdw-review-msg" class="text-xs text-center text-zinc-500"></p>' +
      "</form></div>";
    document.body.appendChild(wrap);
    document.getElementById("jdw-review-close").onclick = function () {
      wrap.classList.add("hidden");
      wrap.classList.remove("flex");
    };
    document.getElementById("jdw-review-form").onsubmit = async function (e) {
      e.preventDefault();
      var f = e.target;
      var msg = document.getElementById("jdw-review-msg");
      msg.textContent = "Sending…";
      try {
        var res = await fetch(API + "/api/reviews", {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stars: Number(f.stars.value),
            name: f.name.value.trim(),
            text: f.text.value.trim(),
            page: location.pathname,
          }),
        });
        if (!res.ok) throw new Error("fail");
        msg.textContent = "Thanks — submitted for moderation.";
        f.reset();
        try {
          localStorage.setItem("jdw_review_submitted", "1");
        } catch (err) {}
        setTimeout(function () {
          wrap.classList.add("hidden");
          wrap.classList.remove("flex");
        }, 1500);
      } catch (err) {
        msg.textContent = "Could not send. Try again later.";
      }
    };
  }

  function openReviewPopup() {
    ensurePopup();
    var wrap = document.getElementById("jdw-review-modal");
    wrap.classList.remove("hidden");
    wrap.classList.add("flex");
  }

  function maybeAutoPopup() {
    try {
      if (localStorage.getItem("jdw_review_submitted")) return;
      if (sessionStorage.getItem("jdw_review_prompted")) return;
    } catch (e) {
      return;
    }
    setTimeout(function () {
      try {
        sessionStorage.setItem("jdw_review_prompted", "1");
      } catch (e) {}
      openReviewPopup();
    }, 45000);
  }

  global.JdwReviews = {
    renderSummary: renderSummary,
    openReviewPopup: openReviewPopup,
    loadPublic: loadPublic,
  };

  document.addEventListener("DOMContentLoaded", function () {
    ensurePopup();
    renderSummary("#jdw-review-summary");
    var btn = document.getElementById("jdw-open-review");
    if (btn) btn.onclick = function (e) {
      e.preventDefault();
      openReviewPopup();
    };
    maybeAutoPopup();
  });
})(window);
