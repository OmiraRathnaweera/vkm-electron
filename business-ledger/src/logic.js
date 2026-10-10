/*
 * Pure calculation / data logic. No DOM and no Electron APIs, so it is shared
 * by the renderer (window.Logic), the main process (require) and the tests.
 *
 * Money is ALWAYS stored as integer cents to avoid floating-point errors
 * (e.g. 0.1 + 0.2 !== 0.3). Only the UI converts to/from display strings.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

  const pad = (n) => String(n).padStart(2, '0');

  /* ---------------------------------------------------------------- money */

  /**
   * Parse user text into integer cents.
   * "" -> 0, "1,234.5" -> 123450, "12.345" -> null (too many decimals),
   * "-5" / "abc" -> null.
   */
  function parseMoney(input) {
    if (input === null || input === undefined) return 0;
    const s = String(input).trim().replace(/[,\s]/g, '');
    if (s === '') return 0;
    if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(s)) return null;
    const [whole, frac = ''] = s.split('.');
    if (whole.length > 12) return null;
    return parseInt(whole || '0', 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  }

  /** 123456 -> "1,234.56" ; -50 -> "-0.50" */
  function formatMoney(cents) {
    const neg = cents < 0;
    const abs = Math.abs(cents);
    const whole = Math.floor(abs / 100);
    const frac = pad(abs % 100);
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + grouped + '.' + frac;
  }

  /** Plain decimal for CSV / editing: 123456 -> "1234.56" */
  function plainMoney(cents) {
    const neg = cents < 0;
    const abs = Math.abs(cents);
    return (neg ? '-' : '') + Math.floor(abs / 100) + '.' + pad(abs % 100);
  }

  /* ---------------------------------------------------------------- dates */

  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

  function isValidISO(s) {
    if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }

  function isValidMonthKey(k) {
    return typeof k === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
  }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  const monthKeyOf = (iso) => iso.slice(0, 7);

  function daysInMonth(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /** Monday of the week containing `iso`. */
  function startOfWeek(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
    return addDays(iso, -dow);
  }

  function addMonths(key, n) {
    const [y, m] = key.split('-').map(Number);
    const idx = y * 12 + (m - 1) + n;
    return Math.floor(idx / 12) + '-' + pad((idx % 12) + 1);
  }

  function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return MONTH_NAMES[m - 1] + ' ' + y;
  }

  function dayLabel(iso) {
    const [, m, d] = iso.split('-').map(Number);
    return MONTH_SHORT[m - 1] + ' ' + d;
  }

  /* ----------------------------------------------------------------- data */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function defaultData() {
    return {
      version: 1,
      settings: { businessName: 'My Business', currency: 'Rs.' },
      months: {},
    };
  }

  const toCents = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);

  /** Defensive clean-up of anything loaded from disk or imported from a backup. */
  function normalizeData(raw) {
    const out = defaultData();
    if (!raw || typeof raw !== 'object') return out;

    if (raw.settings && typeof raw.settings === 'object') {
      if (typeof raw.settings.businessName === 'string') {
        out.settings.businessName = raw.settings.businessName.slice(0, 80);
      }
      if (typeof raw.settings.currency === 'string') {
        out.settings.currency = raw.settings.currency.slice(0, 8);
      }
    }

    const months = raw.months && typeof raw.months === 'object' ? raw.months : {};
    for (const key of Object.keys(months)) {
      if (!isValidMonthKey(key)) continue;
      const m = months[key] || {};
      const rows = Array.isArray(m.rows) ? m.rows : [];
      const seen = new Set();
      out.months[key] = {
        opening: Number.isSafeInteger(m.opening) ? m.opening : null,
        rows: rows
          .filter((r) => r && typeof r === 'object')
          .map((r) => {
            let id = typeof r.id === 'string' && r.id && !seen.has(r.id) ? r.id : uid();
            seen.add(id);
            return {
              id,
              date: typeof r.date === 'string' ? r.date : '',
              desc: typeof r.desc === 'string' ? r.desc.slice(0, 300) : '',
              receipt: toCents(r.receipt),
              payment: toCents(r.payment),
            };
          }),
      };
    }
    return out;
  }

  /** A row's date, falling back to the 1st of its month if blank/out of range. */
  function effectiveDate(key, row) {
    return isValidISO(row.date) && monthKeyOf(row.date) === key ? row.date : key + '-01';
  }

  /**
   * Compute every month: opening balance, running balance per row, totals, closing.
   * A month's opening balance is its manual override, or the closing balance of
   * the closest earlier month that exists (so skipped months are carried across).
   */
  function computeAll(data) {
    const keys = Object.keys(data.months).sort();
    const out = {};
    let prevClosing = 0;
    let prevKey = null;
    for (const key of keys) {
      const m = data.months[key];
      const manual = m.opening !== null && m.opening !== undefined;
      const opening = manual ? m.opening : prevClosing;
      let bal = opening;
      let totalReceipts = 0;
      let totalPayments = 0;
      const balances = {};
      for (const r of m.rows) {
        totalReceipts += r.receipt;
        totalPayments += r.payment;
        bal += r.receipt - r.payment;
        balances[r.id] = bal;
      }
      out[key] = {
        key,
        opening,
        openingIsManual: manual,
        carriedFrom: manual ? null : prevKey,
        balances,
        totalReceipts,
        totalPayments,
        net: totalReceipts - totalPayments,
        closing: bal,
      };
      prevClosing = bal;
      prevKey = key;
    }
    return out;
  }

  /** Opening balance a not-yet-created month would start with. */
  function suggestedOpening(computed, key) {
    const earlier = Object.keys(computed).filter((k) => k < key).sort();
    if (!earlier.length) return { cents: 0, from: null };
    const from = earlier[earlier.length - 1];
    return { cents: computed[from].closing, from };
  }

  /** Balance at the end of day `iso` (carrying across missing months). */
  function balanceAtEndOf(data, computed, iso) {
    const key = monthKeyOf(iso);
    const keys = Object.keys(computed).filter((k) => k <= key).sort();
    if (!keys.length) return 0;
    const last = keys[keys.length - 1];
    if (last < key) return computed[last].closing;
    let bal = computed[last].opening;
    for (const r of data.months[last].rows) {
      if (effectiveDate(last, r) <= iso) bal += r.receipt - r.payment;
    }
    return bal;
  }

  /* -------------------------------------------------------------- reports */

  function flatRows(data) {
    const rows = [];
    for (const key of Object.keys(data.months)) {
      for (const r of data.months[key].rows) {
        rows.push({
          date: effectiveDate(key, r),
          desc: r.desc,
          receipt: r.receipt,
          payment: r.payment,
        });
      }
    }
    return rows;
  }

  function groupByDescription(rows, field) {
    const map = new Map();
    for (const r of rows) {
      const amount = r[field];
      if (!amount) continue;
      const label = r.desc.trim() || '(no description)';
      const k = label.toLowerCase();
      const cur = map.get(k) || { label, amount: 0 };
      cur.amount += amount;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }

  function topN(list, n) {
    if (list.length <= n) return list;
    const head = list.slice(0, n);
    const rest = list.slice(n).reduce((s, x) => s + x.amount, 0);
    return head.concat([{ label: 'Other', amount: rest }]);
  }

  /**
   * Build everything the Reports page needs.
   *  period: 'week' (anchor = any date in that week, Monday-Sunday)
   *          'month' (anchor = 'YYYY-MM')   'year' (anchor = 'YYYY')
   */
  function buildReport(data, period, anchor) {
    const computed = computeAll(data);
    const rows = flatRows(data);
    let start, end, title;
    let labels = [];
    let bucketEnds = [];
    let bucketOf;

    if (period === 'week') {
      start = startOfWeek(anchor);
      end = addDays(start, 6);
      title = dayLabel(start) + ' – ' + dayLabel(end) + ', ' + end.slice(0, 4);
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        labels.push(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] + ' ' + Number(d.slice(8)));
        bucketEnds.push(d);
      }
      bucketOf = (iso) => bucketEnds.indexOf(iso);
    } else if (period === 'month') {
      start = anchor + '-01';
      end = anchor + '-' + pad(daysInMonth(anchor));
      title = monthLabel(anchor);
      for (let i = 1; i <= daysInMonth(anchor); i++) {
        labels.push(String(i));
        bucketEnds.push(anchor + '-' + pad(i));
      }
      bucketOf = (iso) => Number(iso.slice(8)) - 1;
    } else {
      start = anchor + '-01-01';
      end = anchor + '-12-31';
      title = String(anchor);
      for (let m = 1; m <= 12; m++) {
        labels.push(MONTH_SHORT[m - 1]);
        bucketEnds.push(anchor + '-' + pad(m) + '-' + pad(daysInMonth(anchor + '-' + pad(m))));
      }
      bucketOf = (iso) => Number(iso.slice(5, 7)) - 1;
    }

    const receipts = labels.map(() => 0);
    const payments = labels.map(() => 0);
    const inRange = rows.filter((r) => r.date >= start && r.date <= end);
    for (const r of inRange) {
      const i = bucketOf(r.date);
      if (i < 0) continue;
      receipts[i] += r.receipt;
      payments[i] += r.payment;
    }

    const totalReceipts = receipts.reduce((a, b) => a + b, 0);
    const totalPayments = payments.reduce((a, b) => a + b, 0);

    // Opening balance of the period (use a month's own opening if the period
    // starts on the 1st of an existing month, so a manual opening is honoured).
    const startKey = monthKeyOf(start);
    const opening = start.endsWith('-01') && computed[startKey]
      ? computed[startKey].opening
      : balanceAtEndOf(data, computed, addDays(start, -1));
    const closing = balanceAtEndOf(data, computed, end);
    const balance = bucketEnds.map((d) => balanceAtEndOf(data, computed, d));

    return {
      period, anchor, start, end, title, labels,
      receipts, payments, balance,
      totals: {
        receipts: totalReceipts,
        payments: totalPayments,
        net: totalReceipts - totalPayments,
        opening,
        closing,
      },
      count: inRange.length,
      receiptSources: topN(groupByDescription(inRange, 'receipt'), 6),
      paymentSources: topN(groupByDescription(inRange, 'payment'), 6),
    };
  }

  /* ------------------------------------------------------------------ CSV */

  function csvCell(v) {
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function monthToCSV(data, key) {
    const computed = computeAll(data);
    const c = computed[key];
    const m = data.months[key];
    const lines = [['Date', 'Description', 'Receipts', 'Payments', 'Balance']];
    lines.push(['', 'Opening balance', '', '', plainMoney(c.opening)]);
    for (const r of m.rows) {
      lines.push([
        r.date,
        r.desc,
        r.receipt ? plainMoney(r.receipt) : '',
        r.payment ? plainMoney(r.payment) : '',
        plainMoney(c.balances[r.id]),
      ]);
    }
    lines.push(['', 'TOTAL', plainMoney(c.totalReceipts), plainMoney(c.totalPayments), plainMoney(c.closing)]);
    return lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  return {
    MONTH_NAMES, MONTH_SHORT,
    parseMoney, formatMoney, plainMoney,
    isValidISO, isValidMonthKey, todayISO, monthKeyOf, daysInMonth,
    addDays, startOfWeek, addMonths, monthLabel, dayLabel,
    uid, defaultData, normalizeData, effectiveDate,
    computeAll, suggestedOpening, balanceAtEndOf,
    buildReport, monthToCSV,
  };
});
