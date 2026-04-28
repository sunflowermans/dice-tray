(function () {
  "use strict";

  var STORAGE_PREFIX = "jekyll_dice_tray:";
  var STORAGE_EXPANDED = STORAGE_PREFIX + "expanded";
  var STORAGE_HISTORY = STORAGE_PREFIX + "history_v1";

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        n.setAttribute(k, attrs[k]);
      });
    }
    if (text != null) n.textContent = text;
    return n;
  }

  function nowTime() {
    try {
      return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (_) {
      return new Date().toLocaleTimeString();
    }
  }

  function randInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    var span = max - min + 1;
    if (span <= 0) return min;

    if (window.crypto && window.crypto.getRandomValues) {
      var arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return min + (arr[0] % span);
    }
    return min + Math.floor(Math.random() * span);
  }

  function parseExpr(input) {
    var s = String(input || "").trim();
    if (!s) return { kind: "empty" };
    if (s === "/help") return { kind: "help" };

    var m = s.match(/^(\d{0,3})d(\d{1,4})([+-]\d{1,5})?$/i);
    if (!m) return { kind: "invalid", raw: s };

    var count = m[1] ? parseInt(m[1], 10) : 1;
    var sides = parseInt(m[2], 10);
    var mod = m[3] ? parseInt(m[3], 10) : 0;

    if (!Number.isFinite(count) || !Number.isFinite(sides) || !Number.isFinite(mod)) {
      return { kind: "invalid", raw: s };
    }
    if (count < 1) count = 1;
    if (count > 100) count = 100;
    if (sides < 2) sides = 2;
    if (sides > 10000) sides = 10000;
    if (mod < -100000) mod = -100000;
    if (mod > 100000) mod = 100000;

    var normalized = String(count) + "d" + String(sides) + (mod ? (mod > 0 ? "+" + mod : "" + mod) : "");
    return { kind: "roll", count: count, sides: sides, mod: mod, normalized: normalized };
  }

  function rollDice(count, sides) {
    var rolls = [];
    var total = 0;
    for (var i = 0; i < count; i++) {
      var r = randInt(1, sides);
      rolls.push(r);
      total += r;
    }
    return { rolls: rolls, total: total };
  }

  function mountTray(root) {
    var toggle = qs(".jdt-toggle", root);
    var body = qs(".jdt-body", root);
    var input = qs(".jdt-input", root);
    var log = qs(".jdt-log", root);

    function loadBool(key, fallback) {
      try {
        var v = localStorage.getItem(key);
        if (v === null) return fallback;
        return v === "true";
      } catch (_) {
        return fallback;
      }
    }

    function saveBool(key, val) {
      try {
        localStorage.setItem(key, val ? "true" : "false");
      } catch (_) {}
    }

    function loadHistory() {
      try {
        var raw = localStorage.getItem(STORAGE_HISTORY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

    function saveHistory(items) {
      try {
        localStorage.setItem(STORAGE_HISTORY, JSON.stringify(items));
      } catch (_) {}
    }

    var history = loadHistory();

    function setExpanded(expanded) {
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      root.setAttribute("data-expanded", expanded ? "true" : "false");
      // Some themes override [hidden], so enforce display too.
      body.hidden = !expanded;
      body.style.display = expanded ? "" : "none";
      saveBool(STORAGE_EXPANDED, expanded);
      if (expanded) {
        setTimeout(function () {
          input && input.focus();
        }, 0);
      }
    }

    function renderHistory() {
      log.innerHTML = "";
      history.forEach(function (item) {
        if (!item || typeof item !== "object") return;
        if (item.kind === "system") {
          addSystemEntry(item.title || "", item.body || "", item.time || "");
        } else if (item.kind === "roll") {
          addRollEntry(item.expr || "", item.total, item.rolls || [], item.mod || 0, item.time || "");
        }
      });
      log.scrollTop = log.scrollHeight;
    }

    function pushHistory(item) {
      history.push(item);
      // keep it bounded
      if (history.length > 200) history = history.slice(history.length - 200);
      saveHistory(history);
    }

    function addSystemEntry(title, body, timeStr) {
      var entry = el("div", { class: "jdt-entry" });
      entry.appendChild(el("div", { class: "jdt-expr" }, title));
      if (body) entry.appendChild(el("div", { class: "jdt-details" }, body));
      entry.appendChild(el("div", { class: "jdt-details" }, timeStr));
      log.appendChild(entry); // newest at bottom
      log.scrollTop = log.scrollHeight;

      pushHistory({ kind: "system", title: title, body: body, time: timeStr });
    }

    function addRollEntry(expr, total, rolls, mod, timeStr) {
      var entry = el("div", { class: "jdt-entry" });
      entry.appendChild(el("div", { class: "jdt-expr" }, expr));

      var result = el("div", { class: "jdt-result" });
      result.appendChild(el("strong", null, String(total)));
      var rollsText = "[" + rolls.join(", ") + "]";
      if (mod) {
        rollsText += " " + (mod > 0 ? "+" + mod : "" + mod);
      }
      result.appendChild(el("span", { class: "jdt-rolls" }, " " + rollsText));
      entry.appendChild(result);

      entry.appendChild(el("div", { class: "jdt-details" }, timeStr));
      log.appendChild(entry); // newest at bottom
      log.scrollTop = log.scrollHeight;

      pushHistory({ kind: "roll", expr: expr, total: total, rolls: rolls, mod: mod, time: timeStr });
    }

    function showHelp() {
      addSystemEntry(
        "Usage: 1d6, d4, 2d8+1",
        "Click linked dice like 1d20+5 in the docs to roll here. Commands: /help",
        nowTime()
      );
    }

    function doRoll(raw) {
      var p = parseExpr(raw);
      if (p.kind === "empty") return;
      if (p.kind === "help") return showHelp();
      if (p.kind !== "roll") {
        addSystemEntry("Unrecognized roll: " + p.raw, "Try: 1d6, d4, 2d8+1 or /help", nowTime());
        return;
      }

      var r = rollDice(p.count, p.sides);
      var total = r.total + p.mod;
      addRollEntry(p.normalized, total, r.rolls, p.mod, nowTime());
    }

    toggle.addEventListener("click", function () {
      var expanded = toggle.getAttribute("aria-expanded") === "true";
      setExpanded(!expanded);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var v = input.value;
      input.value = "";
      setExpanded(true);
      doRoll(v);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      setExpanded(false);
    });

    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a.dice-tray-roll") : null;
      if (!a) return;
      var expr = a.getAttribute("data-dice") || a.textContent;
      if (!expr) return;
      e.preventDefault();
      setExpanded(true);
      doRoll(expr);
    });

    // Public API
    window.JekyllDiceTray = {
      roll: function (expr) {
        setExpanded(true);
        doRoll(expr);
      },
      open: function () {
        setExpanded(true);
      },
      close: function () {
        setExpanded(false);
      },
    };

    // hydrate history and persisted expanded state (default minimized)
    renderHistory();
    setExpanded(loadBool(STORAGE_EXPANDED, false));
  }

  function boot() {
    var root = document.getElementById("jekyll-dice-tray");
    if (!root) return;
    mountTray(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

