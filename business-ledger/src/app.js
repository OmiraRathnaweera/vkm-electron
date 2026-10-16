/* Renderer: all UI. Calculations live in logic.js; storage lives in main.js. */
(function () {
  "use strict";

  const L = window.Logic;
  const api = window.api;

  const state = {
    data: null,
    computed: null,
    view: "ledger",
    month: L.monthKeyOf(L.todayISO()),
    report: {
      period: "month",
      week: L.todayISO(),
      month: L.monthKeyOf(L.todayISO()),
      year: String(new Date().getFullYear()),
    },
    charts: [],
  };

  /* ------------------------------------------------------------- helpers */

  const $ = (sel, el) => (el || document).querySelector(sel);
  const fmt = (cents) => L.formatMoney(cents);
  const cur = () => state.data.settings.currency || "";
  const money = (cents) => (cur() ? cur() + " " : "") + fmt(cents);

  /** Tiny DOM builder. Uses textContent only, so user text can never inject HTML. */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    props = props || {};
    if (props.type !== undefined) el.type = props.type; // must precede value/min/max
    for (const [k, v] of Object.entries(props)) {
      if (k === "type" || v === null || v === undefined || v === false)
        continue;
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on"))
        el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    const add = (kid) => {
      if (kid === null || kid === undefined || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else
        el.append(
          kid instanceof Node ? kid : document.createTextNode(String(kid)),
        );
    };
    kids.forEach(add);
    return el;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.hidden = true;
    }, 4500);
  }

  function setSaveState(text, isError) {
    const el = $("#saveState");
    if (!el) return; // sidebar not mounted yet
    el.textContent = text;
    el.classList.toggle("error", !!isError);
  }

  let saveChain = Promise.resolve();
  function persist() {
    setSaveState("Saving…");
    saveChain = saveChain
      .then(() => api.saveData(state.data))
      .then(() => setSaveState("✓ All changes saved"))
      .catch((err) => {
        console.error(err);
        setSaveState("⚠ NOT saved", true);
        toast(
          "Could not save your data: " +
            (err && err.message ? err.message : err),
        );
      });
  }

  function recompute() {
    state.computed = L.computeAll(state.data);
  }

  function setMoneyText(el, cents) {
    el.textContent = fmt(cents);
    el.classList.toggle("neg", cents < 0);
  }

  function focusInput(el) {
    if (!el) return;
    el.focus();
    if (el.type === "text") el.select();
  }

  function applyBrand() {
    const name = state.data.settings.businessName || "Business Ledger";
    $("#brandName").textContent = name;
    document.title = name + " – Ledger";
  }

  /** Find a named slot (data-slot="...") inside a Page / Component element. */
  const slot = (root, name) => $('[data-slot="' + name + '"]', root);

  /** Components/summary-card.html -> { el, value, hint } */
  function summaryCard(label, kind, withHint) {
    const el = Fragments.create("Components/summary-card");
    if (kind) el.classList.add(kind);
    slot(el, "label").textContent = label;
    const hint = slot(el, "hint");
    hint.hidden = !withHint;
    return { el, value: slot(el, "value"), hint };
  }

  /** Components/empty-state.html */
  function emptyState(title, text, actionEl) {
    const el = Fragments.create("Components/empty-state");
    slot(el, "title").textContent = title;
    slot(el, "text").textContent = text;
    const action = slot(el, "action");
    if (actionEl) action.append(actionEl);
    else action.remove();
    return el;
  }

  function destroyCharts() {
    state.charts.forEach((c) => c.destroy());
    state.charts = [];
  }

  /* ------------------------------------------------------------- ledger */

  function renderLedger() {
    const root = $("#view");
    root.replaceChildren();
    const key = state.month;
    const m = state.data.months[key];
    const page = Fragments.create("Pages/ledger"); // src/Pages/ledger.html
    root.append(page);

    slot(page, "print-title").textContent =
      state.data.settings.businessName + " — " + L.monthLabel(key);

    /* toolbar: month navigation + actions */
    const existing = Crud.listMonths(state.data); // src/crud/read/listMonths.js
    slot(page, "toolbar").append(
      ...[
        h(
          "button",
          {
            class: "btn icon",
            title: "Previous month",
            "aria-label": "Previous month",
            onclick: () => {
              state.month = L.addMonths(key, -1);
              renderLedger();
            },
          },
          "◀",
        ),
        h("input", {
          type: "month",
          class: "field",
          value: key,
          "aria-label": "Month",
          onchange: (e) => {
            if (L.isValidMonthKey(e.target.value)) {
              state.month = e.target.value;
              renderLedger();
            }
          },
        }),
        h(
          "button",
          {
            class: "btn icon",
            title: "Next month",
            "aria-label": "Next month",
            onclick: () => {
              state.month = L.addMonths(key, 1);
              renderLedger();
            },
          },
          "▶",
        ),
        h(
          "button",
          {
            class: "btn",
            onclick: () => {
              state.month = L.monthKeyOf(L.todayISO());
              renderLedger();
            },
          },
          "This month",
        ),
        existing.length
          ? h(
              "select",
              {
                class: "field",
                "aria-label": "Jump to a saved month",
                onchange: (e) => {
                  if (e.target.value) {
                    state.month = e.target.value;
                    renderLedger();
                  }
                },
              },
              h("option", { value: "" }, "Jump to saved month…"),
              existing.map((k) => h("option", { value: k }, L.monthLabel(k))),
            )
          : null,
        h("div", { class: "spacer" }),
        m
          ? h(
              "button",
              { class: "btn", onclick: () => exportCSV(key) },
              "Export CSV",
            )
          : null,
        m
          ? h(
              "button",
              {
                class: "btn",
                onclick: () => downloadPDF("ledger-" + key + ".pdf", false),
              },
              "Download",
            )
          : null,
        m
          ? h(
              "button",
              { class: "btn danger", onclick: () => deleteMonth(key) },
              "Delete month",
            )
          : null,
      ].filter(Boolean),
    );

    const content = slot(page, "content");

    if (!m) {
      const sug = L.suggestedOpening(state.computed, key);
      content.append(
        emptyState(
          "No table for " + L.monthLabel(key) + " yet",
          sug.from
            ? "It will start with an opening balance of " +
                money(sug.cents) +
                ", carried forward from " +
                L.monthLabel(sug.from) +
                "."
            : "This will be your first month. You can enter an opening balance after creating it.",
          h(
            "button",
            {
              class: "btn primary",
              onclick: () => {
                const res = Crud.addMonth(state.data, key); // src/crud/create/addMonth.js
                if (!res.ok) return toast(res.error);
                recompute();
                persist();
                renderLedger();
              },
            },
            "Create table for " + L.monthLabel(key),
          ),
        ),
      );
      return;
    }

    buildMonthView(content, key, m);
  }

  function buildMonthView(page, key, m) {
    const ui = {};
    const lastDay = key + "-" + String(L.daysInMonth(key)).padStart(2, "0");

    /* summary cards (Components/summary-card.html) */
    const cardOpening = summaryCard("Opening balance");
    const cardReceipts = summaryCard("Total receipts", "receipts");
    const cardPayments = summaryCard("Total payments", "payments");
    const cardClosing = summaryCard("Closing balance", null, true);
    ui.cOpening = cardOpening.value;
    ui.cReceipts = cardReceipts.value;
    ui.cPayments = cardPayments.value;
    ui.cClosing = cardClosing.value;
    ui.cNet = cardClosing.hint;
    page.append(
      h(
        "div",
        { class: "cards no-print" }, // summary cards: on screen only, not in the PDF
        cardOpening.el,
        cardReceipts.el,
        cardPayments.el,
        cardClosing.el,
      ),
    );

    /* opening-balance row */
    ui.openInput = h("input", {
      type: "text",
      class: "num",
      inputmode: "decimal",
      "aria-label": "Opening balance",
      onchange: (e) => {
        const res = Crud.setOpening(state.data, key, e.target.value); // src/crud/update/setOpening.js
        if (res.ok) {
          persist();
          renderLedger();
          return;
        }
        toast(res.error);
        refresh();
      },
      onfocus: (e) => e.target.select(),
    });
    ui.openNote = h("span", {});
    const openingBody = h(
      "tbody",
      {},
      h(
        "tr",
        { class: "opening" },
        h("td", {}),
        h(
          "td",
          { class: "desc-cell" },
          h("strong", {}, "Opening balance"),
          " ",
          ui.openNote,
        ),
        h("td", {}),
        h("td", {}),
        h("td", {}),
        h("td", { class: "bal-input" }, ui.openInput),
        h("td", { class: "act" }),
      ),
    );

    /* entries */
    const tbody = h("tbody", {
      onchange: onRowChange,
      onclick: onRowClick,
      onkeydown: onRowKey,
      onfocusin: (e) => {
        if (e.target.classList && e.target.classList.contains("num"))
          e.target.select();
      },
    });

    /* footer totals */
    ui.fReceipts = h("td", { class: "num tot-receipt" });
    ui.fPayments = h("td", { class: "num tot-payment" });
    ui.fClosing = h("td", { class: "num" });
    const tfoot = h(
      "tfoot",
      {},
      h(
        "tr",
        {},
        h("td", { colSpan: 3 }, "Totals for " + L.monthLabel(key)),
        ui.fReceipts,
        ui.fPayments,
        ui.fClosing,
        h("td", { class: "act" }),
      ),
    );

    const th = (text, cls) => h("th", { class: cls || "" }, text);
    const table = h(
      "table",
      { class: "ledger" },
      h(
        "colgroup",
        {},
        h("col", { class: "c-date" }),
        h("col", {}),
        h("col", { class: "c-cat" }),
        h("col", { class: "c-receipt" }),
        h("col", { class: "c-payment" }),
        h("col", { class: "c-balance" }),
        h("col", { class: "c-act" }),
      ),
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          th("Date"),
          th("Description"),
          th("Category"),
          th("Receipts (" + cur() + ")", "num"),
          th("Payments (" + cur() + ")", "num"),
          th("Balance (" + cur() + ")", "num"),
          th("", "act"),
        ),
      ),
      openingBody,
      tbody,
      tfoot,
    );

    page.append(
      h(
        "div",
        { class: "table-wrap" },
        table,
        h(
          "div",
          { class: "table-actions no-print" },
          h(
            "button",
            { class: "btn primary", onclick: () => addRow() },
            "+ Add row",
          ),
          h("button", { class: "btn", onclick: sortByDate }, "Sort by date"),
        ),
      ),
    );
    page.append(
      h(
        "div",
        { class: "note no-print" },
        "Tip: press Enter to move to the next cell; Enter in the last cell of the last row adds a new row. " +
          "Balances update automatically and everything is saved as you type.",
      ),
    );

    /* ----- behaviour (closures over m / key / ui / tbody) ----- */

    function rowEl(r) {
      return h(
        "tr",
        { dataset: { id: r.id } },
        h(
          "td",
          {},
          h("input", {
            type: "date",
            class: "f-date",
            value: r.date,
            min: key + "-01",
            max: lastDay,
            "aria-label": "Date",
          }),
        ),
        h(
          "td",
          {},
          h("input", {
            type: "text",
            class: "f-desc",
            value: r.desc,
            maxLength: 300,
            placeholder: "Description",
            "aria-label": "Description",
            autocomplete: "off",
          }),
        ),
        h(
          "td",
          { class: "cat" },
          h(
            "select",
            { class: "f-category", "aria-label": "Category" },
            L.CATEGORIES.map((c) =>
              h("option", { value: c, selected: c === r.category }, c),
            ),
          ),
        ),
        h(
          "td",
          { class: "receipt" },
          h("input", {
            type: "text",
            class: "num f-receipt",
            value: r.receipt ? fmt(r.receipt) : "",
            inputmode: "decimal",
            placeholder: "0.00",
            "aria-label": "Receipt amount",
            autocomplete: "off",
          }),
        ),
        h(
          "td",
          { class: "payment" },
          h("input", {
            type: "text",
            class: "num f-payment",
            value: r.payment ? fmt(r.payment) : "",
            inputmode: "decimal",
            placeholder: "0.00",
            "aria-label": "Payment amount",
            autocomplete: "off",
          }),
        ),
        h("td", { class: "bal" }),
        h(
          "td",
          { class: "act" },
          h(
            "button",
            {
              type: "button",
              class: "row-del",
              title: "Delete row",
              "aria-label": "Delete row",
            },
            "×",
          ),
        ),
      );
    }

    function renderRows() {
      tbody.replaceChildren();
      if (!m.rows.length) {
        tbody.append(
          h(
            "tr",
            { class: "empty-row" },
            h(
              "td",
              { colSpan: 7 },
              "No entries yet. Click “Add row” to start.",
            ),
          ),
        );
      } else {
        m.rows.forEach((r) => tbody.append(rowEl(r)));
      }
      refresh();
    }

    function refresh() {
      recompute();
      const c = state.computed[key];
      for (const tr of tbody.children) {
        const id = tr.dataset.id;
        const cell = id && tr.querySelector("td.bal");
        if (cell) setMoneyText(cell, c.balances[id]);
      }
      if (document.activeElement !== ui.openInput)
        ui.openInput.value = fmt(c.opening);

      setMoneyText(ui.cOpening, c.opening);
      setMoneyText(ui.cReceipts, c.totalReceipts);
      setMoneyText(ui.cPayments, c.totalPayments);
      setMoneyText(ui.cClosing, c.closing);
      ui.cNet.textContent =
        "Net this month: " + (c.net > 0 ? "+" : "") + fmt(c.net);
      ui.fReceipts.textContent = fmt(c.totalReceipts);
      ui.fPayments.textContent = fmt(c.totalPayments);
      setMoneyText(ui.fClosing, c.closing);

      ui.openNote.replaceChildren();
      if (c.openingIsManual) {
        const sug = L.suggestedOpening(state.computed, key);
        ui.openNote.append(
          "(set manually) ",
          h(
            "button",
            {
              class: "btn small no-print",
              onclick: () => {
                Crud.setOpening(state.data, key, null);
                persist();
                renderLedger();
              },
            },
            sug.from
              ? "Use balance carried from " + L.monthLabel(sug.from)
              : "Reset to 0.00",
          ),
        );
      } else if (c.carriedFrom) {
        ui.openNote.append(
          "(carried forward from " +
            L.monthLabel(c.carriedFrom) +
            " — edit to override)",
        );
      }
    }

    function findRow(tr) {
      return tr && tr.dataset.id
        ? Crud.getRow(state.data, key, tr.dataset.id)
        : null; // src/crud/read/getRow.js
    }

    function onRowChange(e) {
      const input = e.target;
      const row = findRow(input.closest("tr"));
      if (!row) return;

      const field = input.classList.contains("f-date")
        ? "date"
        : input.classList.contains("f-desc")
          ? "desc"
          : input.classList.contains("f-category")
            ? "category"
            : input.classList.contains("f-receipt")
              ? "receipt"
              : input.classList.contains("f-payment")
                ? "payment"
                : null;
      if (!field) return;

      const res = Crud.updateRow(state.data, key, row.id, field, input.value); // src/crud/update/updateRow.js
      if (!res.ok) {
        toast(res.error);
        input.value =
          field === "receipt" || field === "payment"
            ? row[field]
              ? fmt(row[field])
              : ""
            : row[field];
        return;
      }
      input.value =
        field === "receipt" || field === "payment"
          ? res.value
            ? fmt(res.value)
            : ""
          : res.value;
      refresh();
      persist();
    }

    function onRowClick(e) {
      const btn = e.target.closest(".row-del");
      if (!btn) return;
      const row = findRow(btn.closest("tr"));
      if (!row) return;
      const hasContent = row.desc || row.receipt || row.payment;
      if (
        hasContent &&
        !window.confirm(
          "Delete this row?\n\n" +
            (row.desc || "(no description)") +
            "\n" +
            (row.receipt ? "Receipt: " + fmt(row.receipt) + "\n" : "") +
            (row.payment ? "Payment: " + fmt(row.payment) : ""),
        )
      )
        return;
      Crud.deleteRow(state.data, key, row.id); // src/crud/delete/deleteRow.js
      renderRows();
      persist();
    }

    function onRowKey(e) {
      if (
        e.key !== "Enter" ||
        (e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT")
      )
        return;
      e.preventDefault();
      const input = e.target;
      const tr = input.closest("tr");
      const inputs = [...tr.querySelectorAll("input, select")];
      const i = inputs.indexOf(input);
      if (i < inputs.length - 1) {
        focusInput(inputs[i + 1]);
        return;
      }
      input.blur(); // commits the value (fires "change")
      const next = tr.nextElementSibling;
      if (next) focusInput(next.querySelector("input"));
      else addRow();
    }

    function addRow() {
      const res = Crud.addRow(state.data, key); // src/crud/create/addRow.js
      if (!res.ok) return toast(res.error);
      const row = res.row;
      renderRows();
      persist();
      const tr = tbody.querySelector('tr[data-id="' + row.id + '"]');
      focusInput(tr && tr.querySelector(".f-desc"));
    }

    function sortByDate() {
      Crud.sortRows(state.data, key); // src/crud/update/sortRows.js
      renderRows();
      persist();
      toast("Rows sorted by date.");
    }

    renderRows();
  }

  /** "Download": save what is on screen (print layout) as a PDF file. */
  async function downloadPDF(fileName, landscape) {
    const swapped = [];
    try {
      // Charts are canvases drawn for the screen and are not redrawn for paper, so they would
      // come out the wrong width. Swap each one for an image of itself while the PDF is made.
      document.querySelectorAll(".chart-box canvas").forEach((cv) => {
        const img = new Image();
        img.src = cv.toDataURL("image/png");
        img.alt = "";
        img.className = "chart-snapshot";
        img.style.width = cv.clientWidth + "px";
        cv.style.display = "none";
        cv.parentNode.insertBefore(img, cv);
        swapped.push([cv, img]);
      });
      await Promise.all(swapped.map(([, img]) => img.decode().catch(() => {})));

      const res = await api.savePdf({
        suggestedName: fileName,
        landscape: landscape,
      });
      if (res && res.ok) toast("Saved: " + res.path);
    } catch (err) {
      console.error(err);
      toast(
        "Could not create the PDF: " + (err && err.message ? err.message : err),
      );
    } finally {
      swapped.forEach(([cv, img]) => {
        img.remove();
        cv.style.display = "";
      });
    }
  }

  async function exportCSV(key) {
    const res = await api.saveTextFile({
      suggestedName: "ledger-" + key + ".csv",
      content: "﻿" + L.monthToCSV(state.data, key), // BOM so Excel reads UTF-8
      filters: [{ name: "CSV (opens in Excel)", extensions: ["csv"] }],
    });
    if (res && res.ok) toast("Saved: " + res.path);
  }

  function deleteMonth(key) {
    const m = state.data.months[key];
    const n = m.rows.length;
    const ok = window.confirm(
      "Delete the whole table for " +
        L.monthLabel(key) +
        "?\n\n" +
        n +
        " entr" +
        (n === 1 ? "y" : "ies") +
        " will be removed. This cannot be undone " +
        "(unless you restore a backup).",
    );
    if (!ok) return;
    Crud.deleteMonth(state.data, key); // src/crud/delete/deleteMonth.js
    recompute();
    persist();
    renderLedger();
  }

  /* ------------------------------------------------------------ reports */

  const SOURCE_COLORS = [
    "#2f5fd0",
    "#1f8a70",
    "#d9622b",
    "#8e5bd0",
    "#d0a02f",
    "#2fa6d0",
    "#8a8f98",
  ];

  function cssVar(name) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }

  function renderReports() {
    const root = $("#view");
    root.replaceChildren();
    const rs = state.report;
    const anchor =
      rs.period === "week"
        ? rs.week
        : rs.period === "month"
          ? rs.month
          : rs.year;
    const rep = L.buildReport(state.data, rs.period, anchor);

    const page = Fragments.create("Pages/reports"); // src/Pages/reports.html
    root.append(page);
    slot(page, "period-title").textContent = rep.title;

    const setPeriod = (p) => {
      rs.period = p;
      renderReports();
    };
    const shift = (dir) => {
      if (rs.period === "week") rs.week = L.addDays(rs.week, 7 * dir);
      else if (rs.period === "month") rs.month = L.addMonths(rs.month, dir);
      else rs.year = String(Number(rs.year) + dir);
      renderReports();
    };

    let picker;
    if (rs.period === "week") {
      picker = h("input", {
        type: "date",
        class: "field",
        value: rs.week,
        "aria-label": "Any date in the week",
        onchange: (e) => {
          if (L.isValidISO(e.target.value)) {
            rs.week = e.target.value;
            renderReports();
          }
        },
      });
    } else if (rs.period === "month") {
      picker = h("input", {
        type: "month",
        class: "field",
        value: rs.month,
        "aria-label": "Month",
        onchange: (e) => {
          if (L.isValidMonthKey(e.target.value)) {
            rs.month = e.target.value;
            renderReports();
          }
        },
      });
    } else {
      picker = h("input", {
        type: "number",
        class: "field w-year",
        value: rs.year,
        min: 2000,
        max: 2100,
        step: 1,
        "aria-label": "Year",
        onchange: (e) => {
          const y = parseInt(e.target.value, 10);
          if (y >= 2000 && y <= 2100) {
            rs.year = String(y);
            renderReports();
          }
        },
      });
    }

    const seg = (p, label) =>
      h(
        "button",
        {
          class: rs.period === p ? "active" : "",
          onclick: () => setPeriod(p),
        },
        label,
      );

    slot(page, "toolbar").append(
      h(
        "div",
        { class: "segmented", role: "group", "aria-label": "Period" },
        seg("week", "Week"),
        seg("month", "Month"),
        seg("year", "Year"),
      ),
      h(
        "button",
        {
          class: "btn icon",
          title: "Previous",
          "aria-label": "Previous",
          onclick: () => shift(-1),
        },
        "◀",
      ),
      picker,
      h(
        "button",
        {
          class: "btn icon",
          title: "Next",
          "aria-label": "Next",
          onclick: () => shift(1),
        },
        "▶",
      ),
      h(
        "button",
        {
          class: "btn",
          onclick: () => {
            const t = L.todayISO();
            rs.week = t;
            rs.month = L.monthKeyOf(t);
            rs.year = t.slice(0, 4);
            renderReports();
          },
        },
        rs.period === "week"
          ? "This week"
          : rs.period === "month"
            ? "This month"
            : "This year",
      ),
      h("div", { class: "spacer" }),
      h(
        "button",
        {
          class: "btn",
          onclick: () =>
            downloadPDF("report-" + rs.period + "-" + anchor + ".pdf", false),
        },
        "Download",
      ),
    );

    /* totals (Components/summary-card.html) */
    const t = rep.totals;
    const card = (label, kind, cents, hintText) => {
      const c = summaryCard(label, kind, !!hintText);
      setMoneyText(c.value, cents);
      if (hintText) c.hint.textContent = hintText;
      return c.el;
    };
    slot(page, "cards").append(
      card("Opening balance", null, t.opening),
      card("Total receipts", "receipts", t.receipts),
      card("Total payments", "payments", t.payments),
      card(
        "Closing balance",
        null,
        t.closing,
        "Net: " + (t.net > 0 ? "+" : "") + fmt(t.net) + " " + cur(),
      ),
      card(
        "Fuel expenditure",
        "payments",
        rep.fuel,
        t.payments > 0
          ? Math.round((rep.fuel * 1000) / t.payments) / 10 +
              "% of total payments"
          : "No payments in this period",
      ),
    );
    slot(page, "cards").classList.add("cols-5");

    const grid = slot(page, "charts");

    if (typeof window.Chart === "undefined") {
      const msg = emptyState(
        "Charts unavailable",
        "The chart library did not load. Run “npm install” and restart the app.",
      );
      msg.style.gridColumn = "1 / -1";
      grid.append(msg);
      return;
    }

    window.Chart.defaults.color = cssVar("--muted");
    window.Chart.defaults.borderColor = cssVar("--border");
    window.Chart.defaults.font.family = getComputedStyle(
      document.body,
    ).fontFamily;

    const hasData = rep.count > 0;
    const unit = rs.period === "year" ? "month" : "day";

    /* Components/chart-card.html */
    function chartCard(title, wide) {
      const el = Fragments.create("Components/chart-card");
      el.classList.toggle("wide", !!wide);
      slot(el, "title").textContent = title;
      const box = slot(el, "box");
      grid.append(el);
      return { el, canvas: $("canvas", box), box };
    }
    function emptyNote(box, text) {
      box.replaceChildren(
        h("div", { class: "chart-empty" }, text || "No entries in this period"),
      );
    }
    const tipMoney = (v) => " " + cur() + " " + fmt(Math.round(v * 100));
    const axisMoney = (v) =>
      Math.abs(v) >= 1000 ? (v / 1000).toLocaleString("en-US") + "k" : v;

    /* 1. bar: receipts vs payments per day / month */
    {
      const { canvas, box } = chartCard(
        "Received vs payments by " + unit,
        true,
      );
      if (!hasData) emptyNote(box);
      else {
        state.charts.push(
          new window.Chart(canvas, {
            type: "bar",
            data: {
              labels: rep.labels,
              datasets: [
                {
                  label: "Received",
                  data: rep.receipts.map((c) => c / 100),
                  backgroundColor: cssVar("--receipt"),
                  borderRadius: 3,
                },
                {
                  label: "Payments",
                  data: rep.payments.map((c) => c / 100),
                  backgroundColor: cssVar("--payment"),
                  borderRadius: 3,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                tooltip: {
                  callbacks: {
                    label: (c) => c.dataset.label + ":" + tipMoney(c.parsed.y),
                  },
                },
              },
              scales: {
                y: { beginAtZero: true, ticks: { callback: axisMoney } },
                x: { grid: { display: false } },
              },
            },
          }),
        );
      }
    }

    /* Pie chart. Legend entries show the amount; returns the chart card element. */
    function pieChart(title, names, values, colors) {
      const { el, canvas, box } = chartCard(title);
      if (!values.some((v) => v > 0)) {
        emptyNote(box);
        return el;
      }
      const total = values.reduce((a, b) => a + b, 0);
      state.charts.push(
        new window.Chart(canvas, {
          type: "pie",
          data: {
            labels: names.map((n, i) => n + " — " + fmt(values[i])),
            datasets: [
              {
                data: values.map((c) => c / 100),
                backgroundColor: colors,
                borderColor: cssVar("--surface"),
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: "right" },
              tooltip: {
                callbacks: {
                  label: (c) =>
                    c.label +
                    " (" +
                    Math.round(((c.parsed * 100) / (total / 100)) * 10) / 10 +
                    "%)",
                },
              },
            },
          },
        }),
      );
      return el;
    }

    /* Bar chart for category income. */
    function categoryBarChart(title, names, values, colors, wide) {
      const { el, canvas, box } = chartCard(title, wide);
      if (!values.some((v) => v > 0)) {
        emptyNote(box);
        return el;
      }
      state.charts.push(
        new window.Chart(canvas, {
          type: "bar",
          data: {
            labels: names,
            datasets: [
              {
                label: "Income",
                data: values.map((c) => c / 100),
                backgroundColor: colors,
                borderRadius: 4,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (c) => c.dataset.label + ":" + tipMoney(c.parsed.y),
                },
              },
            },
            scales: {
              y: { beginAtZero: true, ticks: { callback: axisMoney } },
              x: { grid: { display: false } },
            },
          },
        }),
      );
      return el;
    }

    /* 2. pie: received vs payments */
    pieChart(
      "Received vs payments",
      ["Received", "Payments"],
      [t.receipts, t.payments],
      [cssVar("--receipt"), cssVar("--payment")],
    );

    /* 3. Category income (ABC, Chips, Mix, 3/4, Dust, 6*9) */
    const catIncomeValues = L.REPORT_CATEGORIES.map(
      (c) => rep.byCategory[c].receipts,
    );

    /* 3a. pie: Income by category */
    pieChart(
      "Income by category",
      L.REPORT_CATEGORIES,
      catIncomeValues,
      SOURCE_COLORS.slice(0, 6),
    );

    /* 3b. bar: Income by category */
    categoryBarChart(
      "Income by category",
      L.REPORT_CATEGORIES,
      catIncomeValues,
      SOURCE_COLORS.slice(0, 6),
      true,
    );
  }

  /* ----------------------------------------------------------- settings */

  async function renderSettings() {
    const info = await api.appInfo();
    if (state.view !== "settings") return; // user already navigated away

    const root = $("#view");
    root.replaceChildren();
    const page = Fragments.create("Pages/settings"); // src/Pages/settings.html
    root.append(page);
    const s = state.data.settings;

    const nameInput = slot(page, "business-name");
    const curInput = slot(page, "currency");
    nameInput.value = s.businessName;
    curInput.value = s.currency;

    slot(page, "save-settings").addEventListener("click", () => {
      Crud.updateSettings(state.data, {
        // src/crud/update/updateSettings.js
        businessName: nameInput.value,
        currency: curInput.value,
      });
      nameInput.value = s.businessName;
      applyBrand();
      persist();
      toast("Settings saved.");
    });

    slot(page, "backup-export").addEventListener("click", async () => {
      const r = await api.exportBackup();
      if (r && r.ok) toast("Backup saved: " + r.path);
    });

    slot(page, "backup-import").addEventListener("click", async () => {
      const r = await api.importBackup();
      if (r && r.ok) {
        state.data = L.normalizeData(r.data);
        recompute();
        applyBrand();
        setSaveState("✓ All changes saved");
        renderSettings();
        toast("Backup restored.");
      }
    });

    slot(page, "open-folder").addEventListener("click", () =>
      api.openDataFolder(),
    );
    slot(page, "data-path").textContent = info.dataPath;
    slot(page, "about-text").textContent =
      "Business Ledger v" +
      info.version +
      " — works completely offline; no data ever leaves this computer.";
  }

  /* --------------------------------------------------------------- boot */

  /** Swap a placeholder element (e.g. #sidebar-mount) for a Components/*.html piece. */
  function mountComponent(selector, name) {
    $(selector).replaceWith(Fragments.create(name));
  }

  function render() {
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === state.view);
    });
    destroyCharts();
    if (state.view === "ledger") renderLedger();
    else if (state.view === "reports") renderReports();
    else renderSettings();
    $(".main").scrollTop = 0;
  }

  (async function init() {
    try {
      await Fragments.preload(); // reads src/Components/*.html and src/Pages/*.html
      mountComponent("#sidebar-mount", "Components/sidebar");
      mountComponent("#toast-mount", "Components/toast");

      document.querySelectorAll(".nav-btn").forEach((b) => {
        b.addEventListener("click", () => {
          state.view = b.dataset.view;
          render();
        });
      });

      // Re-draw charts if the OS switches between light and dark mode.
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", () => {
          if (state.view === "reports") renderReports();
        });

      state.data = L.normalizeData(await api.loadData());
      recompute();
      applyBrand();
      setSaveState("✓ All changes saved");
      render();
    } catch (err) {
      console.error(err);
      $("#view").textContent =
        "Could not start the app: " + (err && err.message ? err.message : err);
      setSaveState("⚠ Load failed", true);
    }
  })();
})();
