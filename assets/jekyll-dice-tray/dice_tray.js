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
    if (s === "/help" || s === "/h") return { kind: "help" };
    if (s === "/clear" || s === "/c") return { kind: "clear" };
    if (s === "/version" || s === "/v") return { kind: "version" };

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

    var chance = compact.match(/^(\d{1,3})-in-(\d{1,4})$/i);
    if (chance) {
      var successOn = parseInt(chance[1], 10);
      var sides = parseInt(chance[2], 10);

      if (!Number.isFinite(successOn) || !Number.isFinite(sides)) {
        return { kind: "invalid", raw: s };
      }
      if (successOn < 1) successOn = 1;
      if (successOn > 100) successOn = 100;
      if (sides < 2) sides = 2;
      if (sides > 10000) sides = 10000;
      if (successOn > sides) return { kind: "invalid", raw: s };

      return {
        kind: "chance",
        success_on: successOn,
        sides: sides,
        normalized: String(successOn) + "-in-" + String(sides),
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

    function parseKeyEntry(text) {
      if (!text) return null;
      var normalized = text.replace(/[\u2013\u2014]/g, "-");
      if (/^\d+$/.test(normalized)) {
        return { kind: "exact", value: parseInt(normalized, 10) };
      }
      var rangeMatch = normalized.match(/^(\d+)\s*-\s*(\d+)$/);
      if (rangeMatch) {
        var min = parseInt(rangeMatch[1], 10);
        var max = parseInt(rangeMatch[2], 10);
        if (min <= max) return { kind: "range", min: min, max: max };
      }
      return null;
    }

    function rowCells(row) {
      if (!row) return [];
      return Array.prototype.slice.call(row.querySelectorAll("td, th"));
    }

    function cellColumnIndex(row, cell) {
      var cells = rowCells(row);
      for (var i = 0; i < cells.length; i++) {
        if (cells[i] === cell) return i;
      }
      return -1;
    }

    function rowLooksLikeHeader(row) {
      if (!row) return false;
      if (row.querySelector("th")) return true;
      var cells = rowCells(row);
      if (!cells.length) return false;
      var keyCount = 0;
      for (var i = 0; i < cells.length; i++) {
        if (parseKeyEntry(normalizeCellText(cells[i]))) keyCount++;
      }
      // Data rows start with roll keys; header rows are labels / dice expr.
      return keyCount === 0;
    }

    function findTableHeaderRow(table) {
      if (!table) return null;
      var thead = table.querySelector("thead");
      if (thead) {
        var theadRows = thead.querySelectorAll("tr");
        if (theadRows.length) {
          var head = theadRows[theadRows.length - 1];
          // Markdown always wraps the first row in <thead>; skip if it's really data.
          if (!parseKeyEntry(normalizeCellText(rowCells(head)[0] || null))) return head;
        }
      }
      var rows = table.querySelectorAll("tr");
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].querySelector("th") && rowLooksLikeHeader(rows[i])) return rows[i];
      }
      if (rows.length && rowLooksLikeHeader(rows[0])) return rows[0];
      return null;
    }

    function eachDataRow(table, headerRow, fn) {
      var rows = table.querySelectorAll("tr");
      for (var i = 0; i < rows.length; i++) {
        if (rows[i] === headerRow) continue;
        fn(rows[i]);
      }
    }

    // Infer key columns from data: any column that holds a roll number/range in enough rows.
    // Supports 1..N side-by-side (key, value...) groups for any die size.
    function inferKeyColumns(table, headerRow) {
      var counts = [];
      var rowCount = 0;
      eachDataRow(table, headerRow, function (row) {
        var cells = rowCells(row);
        rowCount++;
        for (var i = 0; i < cells.length; i++) {
          if (!counts[i]) counts[i] = 0;
          if (parseKeyEntry(normalizeCellText(cells[i]))) counts[i]++;
        }
      });
      if (rowCount < 1) return [];
      var minHits = Math.min(2, rowCount);
      var keys = [];
      for (var c = 0; c < counts.length; c++) {
        if ((counts[c] || 0) >= minHits) keys.push(c);
      }
      return keys;
    }

    function buildColumnGroups(keyColumns, columnCount) {
      var groups = [];
      for (var k = 0; k < keyColumns.length; k++) {
        var keyIndex = keyColumns[k];
        var nextKey = k + 1 < keyColumns.length ? keyColumns[k + 1] : columnCount;
        var valueIndices = [];
        for (var v = keyIndex + 1; v < nextKey; v++) valueIndices.push(v);
        groups.push({ keyIndex: keyIndex, valueIndices: valueIndices });
      }
      return groups;
    }

    function tableColumnCount(table, headerRow) {
      var max = headerRow ? rowCells(headerRow).length : 0;
      eachDataRow(table, headerRow, function (row) {
        max = Math.max(max, rowCells(row).length);
      });
      return max;
    }

    function collectRowEntriesForGroups(row, groups, allowedKeyIndices) {
      var cells = rowCells(row);
      var entries = [];
      var allowAll = !allowedKeyIndices || !allowedKeyIndices.length;
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        if (!allowAll && allowedKeyIndices.indexOf(group.keyIndex) === -1) continue;
        var keyCell = cells[group.keyIndex];
        if (!keyCell) continue;
        var key = parseKeyEntry(normalizeCellText(keyCell));
        if (!key) continue;
        var valueCells = [];
        var valueIndices = [];
        for (var vi = 0; vi < group.valueIndices.length; vi++) {
          var idx = group.valueIndices[vi];
          if (!cells[idx]) continue;
          valueCells.push(cells[idx]);
          valueIndices.push(idx);
        }
        entries.push({
          key: key,
          keyIndex: group.keyIndex,
          valueCells: valueCells,
          valueIndices: valueIndices,
        });
      }
      return entries;
    }

    function isLookupTable(table, headerRow, groups) {
      if (!table || !groups || !groups.length) return false;
      var matches = 0;
      eachDataRow(table, headerRow, function (row) {
        matches += collectRowEntriesForGroups(row, groups, null).length;
      });
      return matches >= 2;
    }

    function findLookupMatch(table, headerRow, groups, rollTotal, allowedKeyIndices) {
      var exact = null;
      var range = null;
      eachDataRow(table, headerRow, function (row) {
        var entries = collectRowEntriesForGroups(row, groups, allowedKeyIndices);
        for (var e = 0; e < entries.length; e++) {
          var entry = entries[e];
          if (entry.key.kind === "exact" && entry.key.value === rollTotal) {
            if (!exact) exact = { row: row, entry: entry };
          } else if (
            entry.key.kind === "range" &&
            !range &&
            rollTotal >= entry.key.min &&
            rollTotal <= entry.key.max
          ) {
            range = { row: row, entry: entry };
          }
        }
      });
      return exact || range;
    }

    function headerDiceCount(headerRow) {
      if (!headerRow) return 0;
      return headerRow.querySelectorAll('a[data-dice]').length;
    }

    function groupForColumn(groups, columnIndex) {
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        if (columnIndex === group.keyIndex) return group;
        if (group.valueIndices.indexOf(columnIndex) !== -1) return group;
      }
      return null;
    }

    // One die in the header (e.g. d100 over many pairs) => search every group.
    // Several dice (e.g. d10 | Weather | d10 | Terrain | d6 | Mood) => only the clicked group.
    function allowedKeyIndicesForClick(headerRow, clickCell, groups) {
      if (!headerRow || !clickCell || !groups.length) return null;
      if (headerDiceCount(headerRow) <= 1) return null;
      var col = cellColumnIndex(headerRow, clickCell);
      if (col < 0) return null;
      var group = groupForColumn(groups, col);
      return group ? [group.keyIndex] : null;
    }

    function getLookupTableContext(anchor, rollTotal) {
      if (!anchor || !anchor.closest || rollTotal == null) return null;

      var cell = null;
      var table = null;
      var headerRow = null;
      var allowedKeys = null;
      var sourceTable = anchor._jdtSourceTable;

      if (sourceTable && sourceTable.querySelector) {
        // Re-roll from a previous table result in the tray.
        table = sourceTable;
        headerRow = findTableHeaderRow(table);
        allowedKeys = anchor._jdtAllowedKeyIndices || null;
      } else {
        cell = anchor.closest("td, th");
        if (!cell) return null;
        table = cell.closest("table");
        if (!table) return null;
        headerRow = findTableHeaderRow(table);
        // With a header, only header-cell dice trigger lookup (data cells may contain other dice).
        // Without a header, any in-table die can trigger lookup.
        if (headerRow && !headerRow.contains(cell)) return null;
      }

      var keyColumns = inferKeyColumns(table, headerRow);
      if (!keyColumns.length) return null;
      var groups = buildColumnGroups(keyColumns, tableColumnCount(table, headerRow));
      if (!isLookupTable(table, headerRow, groups)) return null;

      if (allowedKeys == null && cell && headerRow) {
        allowedKeys = allowedKeyIndicesForClick(headerRow, cell, groups);
      }
      var matched = findLookupMatch(table, headerRow, groups, rollTotal, allowedKeys);
      if (!matched) return null;

      var headerCells = headerRow ? rowCells(headerRow) : [];
      var entry = matched.entry;
      var columns = [];
      var indices = [entry.keyIndex].concat(entry.valueIndices);
      var cells = [rowCells(matched.row)[entry.keyIndex]].concat(entry.valueCells);
      var diceLabel = String(anchor.getAttribute("data-dice") || normalizeCellText(anchor) || "").trim();

      for (var c = 0; c < cells.length; c++) {
        var valueCell = cells[c];
        if (!valueCell) continue;
        var headerCell = headerCells[indices[c]];
        var headerText = headerCell ? normalizeCellText(headerCell) : "";
        var headerHtml = headerCell ? cellInnerHtml(headerCell) : "";
        // Blank/whitespace key-column headers (common in side-by-side tables) inherit the die notation.
        if (!headerText && c === 0 && diceLabel) {
          headerText = diceLabel;
          headerHtml = "";
        } else if (!headerText) {
          headerHtml = "";
        }
        columns.push({
          header: headerText,
          header_html: headerHtml,
          value: normalizeCellText(valueCell),
          value_html: cellInnerHtml(valueCell),
          // Key-column die prefix is clickable for a table re-roll.
          reroll_expr: c === 0 && diceLabel ? diceLabel : "",
        });
      }

      return columns.length
        ? { columns: columns, _sourceTable: table, _allowedKeyIndices: allowedKeys }
        : null;
    }

    function serializableTableContext(tableContext) {
      if (!tableContext || !tableContext.columns || !tableContext.columns.length) return null;
      return {
        columns: tableContext.columns.map(function (col) {
          return {
            header: col.header || "",
            header_html: col.header_html || "",
            value: col.value || "",
            value_html: col.value_html || "",
            reroll_expr: col.reroll_expr || "",
          };
        }),
      };
    }

    function appendTableContext(entry, tableContext) {
      if (!tableContext || !tableContext.columns || !tableContext.columns.length) return;

      var ctx = el("div", { class: "jdt-table-context" });
      tableContext.columns.forEach(function (col) {
        if (!col || (!col.value && !col.value_html)) return;
        var line = el("div", { class: "jdt-table-row" });
        var headerText = col.header ? String(col.header).trim() : "";
        if (headerText) {
          var headerSpan = el("span", { class: "jdt-table-header" });
          if (col.reroll_expr) {
            var reroll = el(
              "a",
              { class: "dice-tray-roll", href: "#", "data-dice": col.reroll_expr },
              headerText
            );
            if (tableContext._sourceTable && tableContext._sourceTable.querySelector) {
              reroll._jdtSourceTable = tableContext._sourceTable;
            }
            if (tableContext._allowedKeyIndices) {
              reroll._jdtAllowedKeyIndices = tableContext._allowedKeyIndices;
            }
            headerSpan.appendChild(reroll);
          } else if (col.header_html) {
            headerSpan.innerHTML = col.header_html;
          } else {
            headerSpan.textContent = headerText;
          }
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
        } else if (item.kind === "chance") {
          addChanceEntry(
            item.expr || "",
            item.roll,
            item.success_on,
            item.sides,
            !!item.success,
            item.time || "",
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

    function flashNewEntry(entry, skipHistory) {
      if (skipHistory || !entry) return;
      entry.classList.add("jdt-flash");
      var cleared = false;
      function clearFlash() {
        if (cleared) return;
        cleared = true;
        entry.classList.remove("jdt-flash");
        entry.removeEventListener("animationend", clearFlash);
      }
      entry.addEventListener("animationend", clearFlash);
      setTimeout(clearFlash, 500);
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

    function addChanceEntry(expr, roll, successOn, sides, success, timeStr, tableContext, skipHistory) {
      var entry = el("div", { class: "jdt-entry", title: expr });
      var colorClass = success ? "jdt-success" : "jdt-failure";
      var result = el("div", { class: "jdt-result" });

      result.appendChild(el("strong", { class: colorClass }, String(roll)));

      var bracket = el("span", { class: "jdt-rolls" }, " [");
      bracket.appendChild(el("span", { class: colorClass }, String(roll)));
      bracket.appendChild(el("span", null, "]"));
      result.appendChild(bracket);

      entry.appendChild(result);
      appendTableContext(entry, tableContext);

      log.appendChild(entry);
      log.scrollTop = log.scrollHeight;
      flashNewEntry(entry, skipHistory);

      if (skipHistory) return;

      var item = {
        kind: "chance",
        expr: expr,
        roll: roll,
        success_on: successOn,
        sides: sides,
        success: success,
        time: timeStr,
      };
      if (tableContext) item.table_context = serializableTableContext(tableContext);
      pushHistory(item);
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
      flashNewEntry(entry, skipHistory);

      if (skipHistory) return;

      var item = { kind: "roll", expr: expr, total: total, rolls: rolls, mod: mod, time: timeStr };
      if (tableContext) item.table_context = serializableTableContext(tableContext);
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
      flashNewEntry(entry, skipHistory);

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
      if (tableContext) item.table_context = serializableTableContext(tableContext);
      pushHistory(item);
    }

    function showHelp() {
      addSystemEntry(
        "Usage: 1d6, d4, 2d8+1, 2-in-6",
        "Type the dice you want to roll, without a prefix. Click linked dice notation in a table to show the matching entry (number or range).",
        "Commands: /help, /clear, /version",
        nowTime()
      );
    }

    function showVersion() {
      var version = root.getAttribute("data-version") || "unknown";
      addSystemEntry("dice tray " + version, "", nowTime());
    }

    function doRoll(raw, meta) {
      meta = meta || {};
      var anchor = meta.anchor || null;
      var p = parseExpr(raw);
      if (p.kind === "empty") return;
      if (p.kind === "help") return showHelp();
      if (p.kind === "clear") return clearStorageAndUi();
      if (p.kind === "version") return showVersion();
      if (p.kind !== "roll" && p.kind !== "bestof2" && p.kind !== "chance") {
        addSystemEntry("Unrecognized roll: " + p.raw, "Try: 1d6, d4, 2-in-6, 2d8+1 or /help", nowTime());
        return;
      }

      if (p.kind === "chance") {
        var chanceRoll = rollDice(1, p.sides);
        var roll = chanceRoll.rolls[0];
        var success = roll <= p.success_on;
        addChanceEntry(
          p.normalized,
          roll,
          p.success_on,
          p.sides,
          success,
          nowTime(),
          getLookupTableContext(anchor, roll)
        );
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

