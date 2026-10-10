/* Renderer: all UI. Calculations live in logic.js; storage lives in main.js. */
(function () {
  'use strict';

  const L = window.Logic;
  const api = window.api;

  const state = {
    data: null,
    computed: null,
    view: 'ledger',
    month: L.monthKeyOf(L.todayISO()),
    report: {
      period: 'month',
      week: L.todayISO(),
      month: L.monthKeyOf(L.todayISO()),
      year: String(new Date().getFullYear()),
    },
    charts: [],
  };

  /* ------------------------------------------------------------- helpers */

  const $ = (sel, el) => (el || document).querySelector(sel);
  const fmt = (cents) => L.formatMoney(cents);
  const cur = () => state.data.settings.currency || '';
  const money = (cents) => (cur() ? cur() + ' ' : '') + fmt(cents);

  /** Tiny DOM builder. Uses textContent only, so user text can never inject HTML. */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    props = props || {};
    if (props.type !== undefined) el.type = props.type; // must precede value/min/max
    for (const [k, v] of Object.entries(props)) {
      if (k === 'type' || v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (kid) => {
      if (kid === null || kid === undefined || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    };
    kids.forEach(add);
    return el;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  function setSaveState(text, isError) {
    const el = $('#saveState');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
  }

  let saveChain = Promise.resolve();
  function persist() {
    setSaveState('Saving…');
    saveChain = saveChain
      .then(() => api.saveData(state.data))
      .then(() => setSaveState('✓ All changes saved'))
      .catch((err) => {
        console.error(err);
        setSaveState('⚠ NOT saved', true);
        toast('Could not save your data: ' + (err && err.message ? err.message : err));
      });
  }

  function recompute() {
    state.computed = L.computeAll(state.data);
  }

  function setMoneyText(el, cents) {
    el.textContent = fmt(cents);
    el.classList.toggle('neg', cents < 0);
  }

  function focusInput(el) {
    if (!el) return;
    el.focus();
    if (el.type === 'text') el.select();
  }

  function applyBrand() {
    const name = state.data.settings.businessName || 'Business Ledger';
    $('#brandName').textContent = name;
    document.title = name + ' – Ledger';
  }

  function destroyCharts() {
    state.charts.forEach((c) => c.destroy());
    state.charts = [];
  }

  /* ------------------------------------------------------------- ledger */

  function renderLedger() {
    const root = $('#view');
    root.replaceChildren();
    const key = state.month;
    const m = state.data.months[key];
    const page = h('div', { class: 'page' });
    root.append(page);

    page.append(h('div', { class: 'print-only' },
      h('h1', {}, state.data.settings.businessName + ' — ' + L.monthLabel(key))));

    page.append(h('div', { class: 'page-head no-print' }, h('h1', {}, 'Ledger')));

    /* toolbar: month navigation */
    const existing = Object.keys(state.data.months).sort().reverse();
    const toolbar = h('div', { class: 'toolbar' },
      h('button', {
        class: 'btn icon', title: 'Previous month', 'aria-label': 'Previous month',
        onclick: () => { state.month = L.addMonths(key, -1); renderLedger(); },
      }, '◀'),
      h('input', {
        type: 'month', class: 'field', value: key, 'aria-label': 'Month',
        onchange: (e) => {
          if (L.isValidMonthKey(e.target.value)) { state.month = e.target.value; renderLedger(); }
        },
      }),
      h('button', {
        class: 'btn icon', title: 'Next month', 'aria-label': 'Next month',
        onclick: () => { state.month = L.addMonths(key, 1); renderLedger(); },
      }, '▶'),
      h('button', {
        class: 'btn',
        onclick: () => { state.month = L.monthKeyOf(L.todayISO()); renderLedger(); },
      }, 'This month'),
      existing.length
        ? h('select', {
          class: 'field', 'aria-label': 'Jump to a saved month',
          onchange: (e) => { if (e.target.value) { state.month = e.target.value; renderLedger(); } },
        },
        h('option', { value: '' }, 'Jump to saved month…'),
        existing.map((k) => h('option', { value: k }, L.monthLabel(k))))
        : null,
      h('div', { class: 'spacer' }),
      m ? h('button', { class: 'btn', onclick: () => exportCSV(key) }, 'Export CSV') : null,
      m ? h('button', { class: 'btn', onclick: () => window.print() }, 'Print / PDF') : null,
      m ? h('button', { class: 'btn danger', onclick: () => deleteMonth(key) }, 'Delete month') : null);
    page.append(toolbar);

    if (!m) {
      const sug = L.suggestedOpening(state.computed, key);
      page.append(h('div', { class: 'empty-state' },
        h('h2', {}, 'No table for ' + L.monthLabel(key) + ' yet'),
        h('p', {}, sug.from
          ? 'It will start with an opening balance of ' + money(sug.cents) +
            ', carried forward from ' + L.monthLabel(sug.from) + '.'
          : 'This will be your first month. You can enter an opening balance after creating it.'),
        h('button', {
          class: 'btn primary',
          onclick: () => {
            state.data.months[key] = { opening: null, rows: [] };
            recompute();
            persist();
            renderLedger();
          },
        }, 'Create table for ' + L.monthLabel(key))));
      return;
    }

    buildMonthView(page, key, m);
  }

  function buildMonthView(page, key, m) {
    const ui = {};
    const lastDay = key + '-' + String(L.daysInMonth(key)).padStart(2, '0');

    /* summary cards */
    ui.cOpening = h('div', { class: 'value' });
    ui.cReceipts = h('div', { class: 'value' });
    ui.cPayments = h('div', { class: 'value' });
    ui.cClosing = h('div', { class: 'value' });
    ui.cNet = h('div', { class: 'hint' });
    page.append(h('div', { class: 'cards' },
      h('div', { class: 'card' }, h('div', { class: 'label' }, 'Opening balance'), ui.cOpening),
      h('div', { class: 'card receipts' }, h('div', { class: 'label' }, 'Total receipts'), ui.cReceipts),
      h('div', { class: 'card payments' }, h('div', { class: 'label' }, 'Total payments'), ui.cPayments),
      h('div', { class: 'card' }, h('div', { class: 'label' }, 'Closing balance'), ui.cClosing, ui.cNet)));

    /* opening-balance row */
    ui.openInput = h('input', {
      type: 'text', class: 'num', inputmode: 'decimal', 'aria-label': 'Opening balance',
      onchange: (e) => {
        const c = L.parseMoney(e.target.value);
        if (c === null) {
          toast('Enter a valid amount, e.g. 25000 or 25,000.50');
        } else {
          m.opening = c;
          persist();
          renderLedger();
          return;
        }
        refresh();
      },
      onfocus: (e) => e.target.select(),
    });
    ui.openNote = h('span', {});
    const openingBody = h('tbody', {}, h('tr', { class: 'opening' },
      h('td', {}),
      h('td', { class: 'desc-cell' }, h('strong', {}, 'Opening balance'), ' ', ui.openNote),
      h('td', {}), h('td', {}),
      h('td', { class: 'bal-input' }, ui.openInput),
      h('td', { class: 'act' })));

    /* entries */
    const tbody = h('tbody', {
      onchange: onRowChange,
      onclick: onRowClick,
      onkeydown: onRowKey,
      onfocusin: (e) => { if (e.target.classList && e.target.classList.contains('num')) e.target.select(); },
    });

    /* footer totals */
    ui.fReceipts = h('td', { class: 'num tot-receipt' });
    ui.fPayments = h('td', { class: 'num tot-payment' });
    ui.fClosing = h('td', { class: 'num' });
    const tfoot = h('tfoot', {}, h('tr', {},
      h('td', { colSpan: 2 }, 'Totals for ' + L.monthLabel(key)),
      ui.fReceipts, ui.fPayments, ui.fClosing, h('td', { class: 'act' })));

    const th = (text, cls) => h('th', { class: cls || '' }, text);
    const table = h('table', { class: 'ledger' },
      h('colgroup', {},
        h('col', { class: 'c-date' }), h('col', {}), h('col', { class: 'c-receipt' }),
        h('col', { class: 'c-payment' }), h('col', { class: 'c-balance' }), h('col', { class: 'c-act' })),
      h('thead', {}, h('tr', {},
        th('Date'), th('Description'), th('Receipts (' + cur() + ')', 'num'),
        th('Payments (' + cur() + ')', 'num'), th('Balance (' + cur() + ')', 'num'), th('', 'act'))),
      openingBody, tbody, tfoot);

    page.append(h('div', { class: 'table-wrap' }, table,
      h('div', { class: 'table-actions no-print' },
        h('button', { class: 'btn primary', onclick: () => addRow() }, '+ Add row'),
        h('button', { class: 'btn', onclick: sortByDate }, 'Sort by date'))));
    page.append(h('div', { class: 'note no-print' },
      'Tip: press Enter to move to the next cell; Enter in the last cell of the last row adds a new row. ' +
      'Balances update automatically and everything is saved as you type.'));

    /* ----- behaviour (closures over m / key / ui / tbody) ----- */

    function rowEl(r) {
      return h('tr', { dataset: { id: r.id } },
        h('td', {}, h('input', {
          type: 'date', class: 'f-date', value: r.date, min: key + '-01', max: lastDay, 'aria-label': 'Date',
        })),
        h('td', {}, h('input', {
          type: 'text', class: 'f-desc', value: r.desc, maxLength: 300,
          placeholder: 'Description', 'aria-label': 'Description', autocomplete: 'off',
        })),
        h('td', { class: 'receipt' }, h('input', {
          type: 'text', class: 'num f-receipt', value: r.receipt ? fmt(r.receipt) : '',
          inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Receipt amount', autocomplete: 'off',
        })),
        h('td', { class: 'payment' }, h('input', {
          type: 'text', class: 'num f-payment', value: r.payment ? fmt(r.payment) : '',
          inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Payment amount', autocomplete: 'off',
        })),
        h('td', { class: 'bal' }),
        h('td', { class: 'act' }, h('button', {
          type: 'button', class: 'row-del', title: 'Delete row', 'aria-label': 'Delete row',
        }, '×')));
    }

    function renderRows() {
      tbody.replaceChildren();
      if (!m.rows.length) {
        tbody.append(h('tr', { class: 'empty-row' },
          h('td', { colSpan: 6 }, 'No entries yet. Click “Add row” to start.')));
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
        const cell = id && tr.querySelector('td.bal');
        if (cell) setMoneyText(cell, c.balances[id]);
      }
      if (document.activeElement !== ui.openInput) ui.openInput.value = fmt(c.opening);

      setMoneyText(ui.cOpening, c.opening);
      setMoneyText(ui.cReceipts, c.totalReceipts);
      setMoneyText(ui.cPayments, c.totalPayments);
      setMoneyText(ui.cClosing, c.closing);
      ui.cNet.textContent = 'Net this month: ' + (c.net > 0 ? '+' : '') + fmt(c.net);
      ui.fReceipts.textContent = fmt(c.totalReceipts);
      ui.fPayments.textContent = fmt(c.totalPayments);
      setMoneyText(ui.fClosing, c.closing);

      ui.openNote.replaceChildren();
      if (c.openingIsManual) {
        const sug = L.suggestedOpening(state.computed, key);
        ui.openNote.append('(set manually) ',
          h('button', {
            class: 'btn small no-print',
            onclick: () => { m.opening = null; persist(); renderLedger(); },
          }, sug.from ? 'Use balance carried from ' + L.monthLabel(sug.from) : 'Reset to 0.00'));
      } else if (c.carriedFrom) {
        ui.openNote.append('(carried forward from ' + L.monthLabel(c.carriedFrom) + ' — edit to override)');
      } else {
        ui.openNote.append('(enter your starting balance here, if any)');
      }
    }

    function findRow(tr) {
      return tr && tr.dataset.id ? m.rows.find((r) => r.id === tr.dataset.id) : null;
    }

    function onRowChange(e) {
      const input = e.target;
      const row = findRow(input.closest('tr'));
      if (!row) return;

      if (input.classList.contains('f-date')) {
        const v = input.value;
        if (!L.isValidISO(v) || L.monthKeyOf(v) !== key) {
          toast('Please choose a date within ' + L.monthLabel(key) + '.');
          input.value = row.date;
          return;
        }
        row.date = v;
      } else if (input.classList.contains('f-desc')) {
        row.desc = input.value.trim();
        input.value = row.desc;
      } else if (input.classList.contains('f-receipt') || input.classList.contains('f-payment')) {
        const field = input.classList.contains('f-receipt') ? 'receipt' : 'payment';
        const c = L.parseMoney(input.value);
        if (c === null) {
          toast('Enter a valid amount, e.g. 1500 or 1,500.50 (no negatives, max 2 decimals).');
          input.value = row[field] ? fmt(row[field]) : '';
          return;
        }
        row[field] = c;
        input.value = c ? fmt(c) : '';
      } else {
        return;
      }
      refresh();
      persist();
    }

    function onRowClick(e) {
      const btn = e.target.closest('.row-del');
      if (!btn) return;
      const row = findRow(btn.closest('tr'));
      if (!row) return;
      const hasContent = row.desc || row.receipt || row.payment;
      if (hasContent && !window.confirm('Delete this row?\n\n' +
        (row.desc || '(no description)') + '\n' +
        (row.receipt ? 'Receipt: ' + fmt(row.receipt) + '\n' : '') +
        (row.payment ? 'Payment: ' + fmt(row.payment) : ''))) return;
      m.rows = m.rows.filter((r) => r.id !== row.id);
      renderRows();
      persist();
    }

    function onRowKey(e) {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
      e.preventDefault();
      const input = e.target;
      const tr = input.closest('tr');
      const inputs = [...tr.querySelectorAll('input')];
      const i = inputs.indexOf(input);
      if (i < inputs.length - 1) {
        focusInput(inputs[i + 1]);
        return;
      }
      input.blur(); // commits the value (fires "change")
      const next = tr.nextElementSibling;
      if (next) focusInput(next.querySelector('input'));
      else addRow();
    }

    function addRow() {
      const last = m.rows[m.rows.length - 1];
      const today = L.todayISO();
      let date;
      if (last && L.isValidISO(last.date) && L.monthKeyOf(last.date) === key) date = last.date;
      else if (L.monthKeyOf(today) === key) date = today;
      else date = key + '-01';
      const row = { id: L.uid(), date, desc: '', receipt: 0, payment: 0 };
      m.rows.push(row);
      renderRows();
      persist();
      const tr = tbody.querySelector('tr[data-id="' + row.id + '"]');
      focusInput(tr && tr.querySelector('.f-desc'));
    }

    function sortByDate() {
      m.rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // stable
      renderRows();
      persist();
      toast('Rows sorted by date.');
    }

    renderRows();
  }

  async function exportCSV(key) {
    const res = await api.saveTextFile({
      suggestedName: 'ledger-' + key + '.csv',
      content: '﻿' + L.monthToCSV(state.data, key), // BOM so Excel reads UTF-8
      filters: [{ name: 'CSV (opens in Excel)', extensions: ['csv'] }],
    });
    if (res && res.ok) toast('Saved: ' + res.path);
  }

  function deleteMonth(key) {
    const m = state.data.months[key];
    const n = m.rows.length;
    const ok = window.confirm(
      'Delete the whole table for ' + L.monthLabel(key) + '?\n\n' +
      n + ' entr' + (n === 1 ? 'y' : 'ies') + ' will be removed. This cannot be undone ' +
      '(unless you restore a backup).');
    if (!ok) return;
    delete state.data.months[key];
    recompute();
    persist();
    renderLedger();
  }

  /* ------------------------------------------------------------ reports */

  const SOURCE_COLORS = ['#2f5fd0', '#1f8a70', '#d9622b', '#8e5bd0', '#d0a02f', '#2fa6d0', '#8a8f98'];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function renderReports() {
    const root = $('#view');
    root.replaceChildren();
    const rs = state.report;
    const anchor = rs.period === 'week' ? rs.week : rs.period === 'month' ? rs.month : rs.year;
    const rep = L.buildReport(state.data, rs.period, anchor);

    const page = h('div', { class: 'page' });
    root.append(page);
    page.append(h('div', { class: 'page-head' },
      h('h1', {}, 'Reports & charts'),
      h('span', { class: 'note' }, rep.title)));

    const setPeriod = (p) => { rs.period = p; renderReports(); };
    const shift = (dir) => {
      if (rs.period === 'week') rs.week = L.addDays(rs.week, 7 * dir);
      else if (rs.period === 'month') rs.month = L.addMonths(rs.month, dir);
      else rs.year = String(Number(rs.year) + dir);
      renderReports();
    };

    let picker;
    if (rs.period === 'week') {
      picker = h('input', {
        type: 'date', class: 'field', value: rs.week, 'aria-label': 'Any date in the week',
        onchange: (e) => { if (L.isValidISO(e.target.value)) { rs.week = e.target.value; renderReports(); } },
      });
    } else if (rs.period === 'month') {
      picker = h('input', {
        type: 'month', class: 'field', value: rs.month, 'aria-label': 'Month',
        onchange: (e) => { if (L.isValidMonthKey(e.target.value)) { rs.month = e.target.value; renderReports(); } },
      });
    } else {
      picker = h('input', {
        type: 'number', class: 'field', value: rs.year, min: 2000, max: 2100, step: 1, 'aria-label': 'Year',
        style: 'width:96px',
        onchange: (e) => {
          const y = parseInt(e.target.value, 10);
          if (y >= 2000 && y <= 2100) { rs.year = String(y); renderReports(); }
        },
      });
    }

    const seg = (p, label) => h('button', {
      class: rs.period === p ? 'active' : '', onclick: () => setPeriod(p),
    }, label);

    page.append(h('div', { class: 'toolbar' },
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Period' },
        seg('week', 'Week'), seg('month', 'Month'), seg('year', 'Year')),
      h('button', { class: 'btn icon', title: 'Previous', 'aria-label': 'Previous', onclick: () => shift(-1) }, '◀'),
      picker,
      h('button', { class: 'btn icon', title: 'Next', 'aria-label': 'Next', onclick: () => shift(1) }, '▶'),
      h('button', {
        class: 'btn',
        onclick: () => {
          const t = L.todayISO();
          rs.week = t; rs.month = L.monthKeyOf(t); rs.year = t.slice(0, 4);
          renderReports();
        },
      }, rs.period === 'week' ? 'This week' : rs.period === 'month' ? 'This month' : 'This year'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => window.print() }, 'Print / PDF')));

    const t = rep.totals;
    const valueEl = (cents) => {
      const el = h('div', { class: 'value' });
      setMoneyText(el, cents);
      return el;
    };
    page.append(h('div', { class: 'cards' },
      h('div', { class: 'card' }, h('div', { class: 'label' }, 'Opening balance'), valueEl(t.opening)),
      h('div', { class: 'card receipts' }, h('div', { class: 'label' }, 'Total receipts'), valueEl(t.receipts)),
      h('div', { class: 'card payments' }, h('div', { class: 'label' }, 'Total payments'), valueEl(t.payments)),
      h('div', { class: 'card' }, h('div', { class: 'label' }, 'Closing balance'), valueEl(t.closing),
        h('div', { class: 'hint' }, 'Net: ' + (t.net > 0 ? '+' : '') + fmt(t.net) + ' ' + cur()))));

    const grid = h('div', { class: 'charts' });
    page.append(grid);

    if (typeof window.Chart === 'undefined') {
      grid.append(h('div', { class: 'empty-state' }, h('h2', {}, 'Charts unavailable'),
        h('p', {}, 'The chart library did not load. Run “npm install” and restart the app.')));
      return;
    }

    window.Chart.defaults.color = cssVar('--muted');
    window.Chart.defaults.borderColor = cssVar('--border');
    window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

    const hasData = rep.count > 0;
    const unit = (rs.period === 'year' ? 'month' : 'day');

    function chartCard(title, wide) {
      const canvas = h('canvas', {});
      const box = h('div', { class: 'chart-box' }, canvas);
      grid.append(h('div', { class: 'chart-card' + (wide ? ' wide' : '') }, h('h3', {}, title), box));
      return { canvas, box };
    }
    function emptyNote(box, text) {
      box.replaceChildren(h('div', { class: 'chart-empty' }, text || 'No entries in this period'));
    }
    const tipMoney = (v) => ' ' + cur() + ' ' + fmt(Math.round(v * 100));
    const axisMoney = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('en-US') + 'k' : v);

    /* 1. bar: receipts vs payments per day / month */
    {
      const { canvas, box } = chartCard('Receipts and payments by ' + unit, true);
      if (!hasData) emptyNote(box);
      else {
        state.charts.push(new window.Chart(canvas, {
          type: 'bar',
          data: {
            labels: rep.labels,
            datasets: [
              { label: 'Receipts', data: rep.receipts.map((c) => c / 100), backgroundColor: cssVar('--receipt'), borderRadius: 3 },
              { label: 'Payments', data: rep.payments.map((c) => c / 100), backgroundColor: cssVar('--payment'), borderRadius: 3 },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ':' + tipMoney(c.parsed.y) } } },
            scales: { y: { beginAtZero: true, ticks: { callback: axisMoney } }, x: { grid: { display: false } } },
          },
        }));
      }
    }

    /* 2. line: balance */
    {
      const { canvas, box } = chartCard('Balance at end of each ' + unit);
      if (!hasData) emptyNote(box);
      else {
        state.charts.push(new window.Chart(canvas, {
          type: 'line',
          data: {
            labels: rep.labels,
            datasets: [{
              label: 'Balance', data: rep.balance.map((c) => c / 100),
              borderColor: cssVar('--balance'), backgroundColor: cssVar('--balance'),
              tension: 0.25, pointRadius: rep.labels.length > 14 ? 0 : 3, fill: false,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => 'Balance:' + tipMoney(c.parsed.y) } } },
            scales: { y: { ticks: { callback: axisMoney } }, x: { grid: { display: false } } },
          },
        }));
      }
    }

    function pieChart(title, labels, values, colors) {
      const { canvas, box } = chartCard(title);
      if (!values.some((v) => v > 0)) { emptyNote(box); return; }
      const total = values.reduce((a, b) => a + b, 0);
      state.charts.push(new window.Chart(canvas, {
        type: 'pie',
        data: {
          labels,
          datasets: [{ data: values.map((c) => c / 100), backgroundColor: colors, borderColor: cssVar('--surface'), borderWidth: 2 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right' },
            tooltip: {
              callbacks: {
                label: (c) => c.label + ':' + tipMoney(c.parsed) +
                  ' (' + Math.round((c.parsed * 100 / total) * 1000) / 10 + '%)',
              },
            },
          },
        },
      }));
    }

    /* 3. pie: receipts vs payments */
    pieChart('Receipts vs payments', ['Receipts', 'Payments'], [t.receipts, t.payments],
      [cssVar('--receipt'), cssVar('--payment')]);

    /* 4/5. pies by description */
    const colorsFor = (list) => list.map((x, i) => (x.label === 'Other' ? SOURCE_COLORS[6] : SOURCE_COLORS[i % 6]));
    pieChart('Where the money went (payments by description)',
      rep.paymentSources.map((x) => x.label), rep.paymentSources.map((x) => x.amount), colorsFor(rep.paymentSources));
    pieChart('Where the money came from (receipts by description)',
      rep.receiptSources.map((x) => x.label), rep.receiptSources.map((x) => x.amount), colorsFor(rep.receiptSources));
  }

  /* ----------------------------------------------------------- settings */

  async function renderSettings() {
    const root = $('#view');
    root.replaceChildren();
    const info = await api.appInfo();
    const s = state.data.settings;

    const page = h('div', { class: 'page' });
    root.append(page);
    page.append(h('div', { class: 'page-head' }, h('h1', {}, 'Settings & backup')));

    const nameInput = h('input', { type: 'text', class: 'field', value: s.businessName, maxLength: 80, style: 'width:280px' });
    const curInput = h('input', { type: 'text', class: 'field', value: s.currency, maxLength: 8, style: 'width:90px' });
    const saveBtn = h('button', {
      class: 'btn primary',
      onclick: () => {
        s.businessName = nameInput.value.trim() || 'My Business';
        s.currency = curInput.value.trim();
        applyBrand();
        persist();
        toast('Settings saved.');
      },
    }, 'Save');
    page.append(h('div', { class: 'panel' },
      h('h2', {}, 'Business'),
      h('p', {}, 'Shown in the sidebar and at the top of printed pages.'),
      h('div', { class: 'form-row' },
        h('label', {}, 'Business name', nameInput),
        h('label', {}, 'Currency label', curInput),
        saveBtn)));

    page.append(h('div', { class: 'panel' },
      h('h2', {}, 'Backup & restore'),
      h('p', {}, 'Your data lives only on this computer. Save a backup copy to a USB drive or cloud folder regularly. ' +
        'The app also keeps a daily snapshot of the last 30 days automatically.'),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn',
          onclick: async () => {
            const r = await api.exportBackup();
            if (r && r.ok) toast('Backup saved: ' + r.path);
          },
        }, 'Save backup copy…'),
        h('button', {
          class: 'btn',
          onclick: async () => {
            const r = await api.importBackup();
            if (r && r.ok) {
              state.data = L.normalizeData(r.data);
              recompute();
              applyBrand();
              setSaveState('✓ All changes saved');
              renderSettings();
              toast('Backup restored.');
            }
          },
        }, 'Restore from backup…'),
        h('button', { class: 'btn', onclick: () => api.openDataFolder() }, 'Open data folder')),
      h('code', { class: 'path' }, info.dataPath)));

    page.append(h('div', { class: 'panel' },
      h('h2', {}, 'About'),
      h('p', { style: 'margin:0' }, 'Business Ledger v' + info.version + ' — works completely offline; no data ever leaves this computer.')));
  }

  /* --------------------------------------------------------------- boot */

  function render() {
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === state.view);
    });
    destroyCharts();
    if (state.view === 'ledger') renderLedger();
    else if (state.view === 'reports') renderReports();
    else renderSettings();
    $('.main').scrollTop = 0;
  }

  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.addEventListener('click', () => { state.view = b.dataset.view; render(); });
  });

  // Re-draw charts if the OS switches between light and dark mode.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.view === 'reports') renderReports();
  });

  (async function init() {
    try {
      state.data = L.normalizeData(await api.loadData());
      recompute();
      applyBrand();
      setSaveState('✓ All changes saved');
      render();
    } catch (err) {
      console.error(err);
      $('#view').textContent = 'Could not load your data: ' + (err && err.message ? err.message : err);
      setSaveState('⚠ Load failed', true);
    }
  })();
})();
