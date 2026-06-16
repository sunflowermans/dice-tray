(function () {
  "use strict";

  var STORAGE_PREFIX = "jekyll_dice_tray:";
  var STORAGE_EXPANDED = STORAGE_PREFIX + "expanded";
  var STORAGE_HISTORY = STORAGE_PREFIX + "history_v1";
  var STORAGE_INPUT_HISTORY = STORAGE_PREFIX + "input_history_v1";

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
    if (s === "/clear") return { kind: "clear" };

    // Allow whitespace variations like "d20 + 2"
    var compact = s.replace(/\s+/g, "");

    // Advantage/Disadvantage roll:
    // - "d12+d6(+2)" => take higher of the two totals
    // - "d12-d6(+2)" => take lower of the two totals
    // Modifier applies after choosing.
    // Only allow single-die expressions on each side: dX+dY or dX-dY (no leading counts).
    var best = compact.match(/^d(\d{1,4})([+-])d(\d{1,4})([+-]\d{1,5})?$/i);
    if (best) {
      var c1 = 1;
      var s1 = parseInt(best[1], 10);
      var op = best[2]; // "+" => take higher, "-" => take lower
      var c2 = 1;
      var s2 = parseInt(best[3], 10);
      var modB = best[4] ? parseInt(best[4], 10) : 0;

      if (!Number.isFinite(c1) || !Number.isFinite(s1) || !Number.isFinite(c2) || !Number.isFinite(s2) || !Number.isFinite(modB)) {
        return { kind: "invalid", raw: s };
      }
      if (c1 < 1) c1 = 1;
      if (c1 > 100) c1 = 100;
      if (s1 < 2) s1 = 2;
      if (s1 > 10000) s1 = 10000;
      if (c2 < 1) c2 = 1;
      if (c2 > 100) c2 = 100;
      if (s2 < 2) s2 = 2;
      if (s2 > 10000) s2 = 10000;
      if (modB < -100000) modB = -100000;
      if (modB > 100000) modB = 100000;

      var left = "d" + String(s1);
      var right = "d" + String(s2);
      var normalizedB = left + op + right + (modB ? (modB > 0 ? "+" + modB : "" + modB) : "");
      return {
        kind: "bestof2",
        left: { count: c1, sides: s1 },
        right: { count: c2, sides: s2 },
        op: op,
        mod: modB,
        normalized: normalizedB,
      };
    }

    var m = compact.match(/^(\d{0,3})d(\d{1,4})([+-]\d{1,5})?$/i);
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
    function normalizeCellText(node) {
      return String(node && node.textContent ? node.textContent : "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function cellInnerHtml(node) {
      return node && node.innerHTML ? node.innerHTML.trim() : "";
    }

    function findTableHeaderRow(table) {
      if (!table) return null;
      var thead = table.querySelector("thead");
      if (thead) {
        var theadRows = thead.querySelectorAll("tr");
        if (theadRows.length) return theadRows[theadRows.length - 1];
      }
      var rows = table.querySelectorAll("tr");
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].querySelector("th")) return rows[i];
      }
      return table.querySelector("tr");
    }

    function firstColumnNumber(row) {
      if (!row) return null;
      var cell = row.querySelector("td, th");
      if (!cell) return null;
      var text = normalizeCellText(cell);
      if (!/^\d+$/.test(text)) return null;
      return parseInt(text, 10);
    }

    function isLookupTable(table, headerRow) {
      if (!table || !headerRow) return false;
      var rows = table.querySelectorAll("tr");
      var matches = 0;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i] === headerRow) continue;
        if (firstColumnNumber(rows[i]) !== null) matches++;
      }
      return matches >= 2;
    }

    function findLookupRow(table, headerRow, rollTotal) {
      var rows = table.querySelectorAll("tr");
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row === headerRow) continue;
        var n = firstColumnNumber(row);
        if (n !== null && n === rollTotal) return row;
      }
      return null;
    }

    function getLookupTableContext(anchor, rollTotal) {
      if (!anchor || !anchor.closest || rollTotal == null) return null;
      var cell = anchor.closest("td, th");
      if (!cell) return null;
      var clickRow = cell.closest("tr");
      if (!clickRow) return null;
      var table = clickRow.closest("table");
      if (!table) return null;

      var headerRow = findTableHeaderRow(table);
      if (!headerRow || !headerRow.contains(cell)) return null;
      if (!isLookupTable(table, headerRow)) return null;

      var matchedRow = findLookupRow(table, headerRow, rollTotal);
      if (!matchedRow) return null;

      var headerCells = Array.prototype.slice.call(headerRow.querySelectorAll("td, th"));
      var valueCells = Array.prototype.slice.call(matchedRow.querySelectorAll("td, th"));
      var columns = [];

      for (var c = 0; c < valueCells.length; c++) {
        var headerCell = headerCells[c];
        var valueCell = valueCells[c];
        columns.push({
          header: headerCell ? normalizeCellText(headerCell) : "",
          header_html: headerCell ? cellInnerHtml(headerCell) : "",
          value: normalizeCellText(valueCell),
          value_html: cellInnerHtml(valueCell),
        });
      }

      return columns.length ? { columns: columns } : null;
    }

    function appendTableContext(entry, tableContext) {
      if (!tableContext || !tableContext.columns || !tableContext.columns.length) return;

      var ctx = el("div", { class: "jdt-table-context" });
      tableContext.columns.forEach(function (col) {
        if (!col || (!col.value && !col.value_html)) return;
        var line = el("div", { class: "jdt-table-row" });
        if (col.header || col.header_html) {
          var headerSpan = el("span", { class: "jdt-table-header" });
          if (col.header_html) headerSpan.innerHTML = col.header_html;
          else headerSpan.textContent = col.header;
          line.appendChild(headerSpan);
          line.appendChild(el("span", { class: "jdt-table-sep" }, ": "));
        }
        var valueSpan = el("span", { class: "jdt-table-value" });
        if (col.value_html) valueSpan.innerHTML = col.value_html;
        else valueSpan.textContent = col.value || "";
        line.appendChild(valueSpan);
        ctx.appendChild(line);
      });
      if (ctx.childNodes.length) entry.appendChild(ctx);
    }

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

    function loadInputHistory() {
      try {
        var raw = localStorage.getItem(STORAGE_INPUT_HISTORY);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }

    function saveInputHistory(items) {
      try {
        localStorage.setItem(STORAGE_INPUT_HISTORY, JSON.stringify(items));
      } catch (_) {}
    }

    function saveHistory(items) {
      try {
        localStorage.setItem(STORAGE_HISTORY, JSON.stringify(items));
      } catch (_) {}
    }

    var history = loadHistory();
    var inputHistory = loadInputHistory();
    var inputHistoryIdx = inputHistory.length; // points just past last

    function clearStorageAndUi() {
      try {
        // clear dice tray history
        localStorage.removeItem(STORAGE_HISTORY);
        // clear input history (up-arrow)
        localStorage.removeItem(STORAGE_INPUT_HISTORY);
      } catch (_) {}

      history = [];
      inputHistory = [];
      inputHistoryIdx = 0;
      log.innerHTML = "";

      // Confirmation (not persisted); keep current expanded/minimized state
      var entry = el("div", { class: "jdt-entry", title: "/clear" });
      entry.appendChild(el("div", { class: "jdt-expr" }, "Cleared dice tray history and input history."));
      entry.appendChild(el("div", { class: "jdt-details" }, nowTime()));
      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
    }

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
        } else if (item.kind === "bestof2") {
          addBestOf2Entry(
            item.expr || "",
            item.chosen_total,
            item.left_rolls || [],
            item.right_rolls || [],
            !!item.left_is_winner,
            item.left_label || "",
            item.right_label || "",
            item.mod || 0,
            item.time || "",
            item.mode || "high",
            item.table_context || null,
            true
          );
        } else if (item.kind === "roll") {
          addRollEntry(
            item.expr || "",
            item.total,
            item.rolls || [],
            item.mod || 0,
            item.time || "",
            item.table_context || null,
            true
          );
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

    function addRollEntry(expr, total, rolls, mod, timeStr, tableContext, skipHistory) {
      var entry = el("div", { class: "jdt-entry", title: expr });

      var result = el("div", { class: "jdt-result" });
      result.appendChild(el("strong", null, String(total)));
      var rollsText = "[" + rolls.join(", ") + "]";
      if (mod) {
        rollsText += " " + (mod > 0 ? "+" + mod : "" + mod);
      }
      result.appendChild(el("span", { class: "jdt-rolls" }, " " + rollsText));

      entry.appendChild(result);
      appendTableContext(entry, tableContext);

      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;

      if (skipHistory) return;

      var item = { kind: "roll", expr: expr, total: total, rolls: rolls, mod: mod, time: timeStr };
      if (tableContext) item.table_context = tableContext;
      pushHistory(item);
    }

    function addBestOf2Entry(expr, chosenTotal, leftRolls, rightRolls, leftIsWinner, leftLabel, rightLabel, mod, timeStr, mode, tableContext, skipHistory) {
      var entry = el("div", { class: "jdt-entry", title: expr });
      entry.appendChild(el("div", { class: "jdt-expr" }, expr));

      var result = el("div", { class: "jdt-result" });
      result.appendChild(el("strong", null, String(chosenTotal)));

      // Single bracket containing both pools in left->right order.
      var bracket = el("span", { class: "jdt-rolls" }, " [");
      var leftSpan = el("span", { class: "jdt-vs-part" }, leftRolls.join(", "));
      leftSpan.setAttribute("title", leftLabel);
      if (!leftIsWinner) leftSpan.className += " jdt-loser";
      bracket.appendChild(leftSpan);

      bracket.appendChild(el("span", { class: "jdt-vs-sep" }, ", "));

      var rightSpan = el("span", { class: "jdt-vs-part" }, rightRolls.join(", "));
      rightSpan.setAttribute("title", rightLabel);
      if (leftIsWinner) rightSpan.className += " jdt-loser";
      bracket.appendChild(rightSpan);

      bracket.appendChild(el("span", null, "]"));
      bracket.setAttribute("title", mode === "low" ? "Take lower" : "Take higher");
      result.appendChild(bracket);

      if (mod) {
        result.appendChild(el("span", { class: "jdt-rolls" }, " " + (mod > 0 ? "+" + mod : "" + mod)));
      }

      entry.appendChild(result);
      appendTableContext(entry, tableContext);
      entry.appendChild(el("div", { class: "jdt-details" }, timeStr));

      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;

      if (skipHistory) return;

      var item = {
        kind: "bestof2",
        expr: expr,
        chosen_total: chosenTotal,
        left_rolls: leftRolls,
        right_rolls: rightRolls,
        left_is_winner: leftIsWinner,
        left_label: leftLabel,
        right_label: rightLabel,
        mode: mode,
        mod: mod,
        time: timeStr,
      };
      if (tableContext) item.table_context = tableContext;
      pushHistory(item);
    }

    function showHelp() {
      addSystemEntry(
        "Usage: 1d6, d4, 2d8+1",
        "Click linked dice like 1d20+5 or bracket modifiers like [+1] (rolls d20+1). Clicking a table die (e.g. 1d12) shows the matching row. Commands: /help, /clear",
        nowTime()
      );
    }

    function doRoll(raw, meta) {
      meta = meta || {};
      var anchor = meta.anchor || null;
      var p = parseExpr(raw);
      if (p.kind === "empty") return;
      if (p.kind === "help") return showHelp();
      if (p.kind === "clear") return clearStorageAndUi();
      if (p.kind !== "roll" && p.kind !== "bestof2") {
        addSystemEntry("Unrecognized roll: " + p.raw, "Try: 1d6, d4, 2d8+1 or /help", nowTime());
        return;
      }

      if (p.kind === "bestof2") {
        var left = rollDice(p.left.count, p.left.sides);
        var right = rollDice(p.right.count, p.right.sides);
        var leftLabel = String(p.left.count) + "d" + String(p.left.sides);
        var rightLabel = String(p.right.count) + "d" + String(p.right.sides);

        var mode = p.op === "-" ? "low" : "high";
        var leftIsWinner = mode === "low" ? left.total <= right.total : left.total >= right.total;
        var chosenPreMod = leftIsWinner ? left.total : right.total;
        var chosenTotal = chosenPreMod + p.mod;

        addBestOf2Entry(
          p.normalized,
          chosenTotal,
          left.rolls,
          right.rolls,
          leftIsWinner,
          leftLabel,
          rightLabel,
          p.mod,
          nowTime(),
          mode,
          getLookupTableContext(anchor, chosenTotal)
        );
        return;
      }

      var r = rollDice(p.count, p.sides);
      var total = r.total + p.mod;
      addRollEntry(p.normalized, total, r.rolls, p.mod, nowTime(), getLookupTableContext(anchor, total));
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

      var raw = String(v || "").trim();
      if (raw) {
        if (inputHistory.length === 0 || inputHistory[inputHistory.length - 1] !== raw) {
          inputHistory.push(raw);
          if (inputHistory.length > 100) inputHistory = inputHistory.slice(inputHistory.length - 100);
          saveInputHistory(inputHistory);
        }
      }
      inputHistoryIdx = inputHistory.length;

      doRoll(v);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      setExpanded(false);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (!inputHistory || inputHistory.length === 0) return;
      e.preventDefault();

      if (e.key === "ArrowUp") {
        inputHistoryIdx = Math.max(0, inputHistoryIdx - 1);
        input.value = inputHistory[inputHistoryIdx] || "";
      } else {
        inputHistoryIdx = Math.min(inputHistory.length, inputHistoryIdx + 1);
        input.value = inputHistoryIdx === inputHistory.length ? "" : inputHistory[inputHistoryIdx] || "";
      }
      setTimeout(function () {
        try {
          input.setSelectionRange(input.value.length, input.value.length);
        } catch (_) {}
      }, 0);
    });

    input.addEventListener("input", function () {
      inputHistoryIdx = inputHistory.length;
    });

    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a.dice-tray-roll") : null;
      if (!a) return;
      var expr = a.getAttribute("data-dice") || a.textContent;
      if (!expr) return;
      e.preventDefault();
      setExpanded(true);
      doRoll(expr, { anchor: a });
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

