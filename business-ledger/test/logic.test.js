const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/logic.js');

const row = (date, desc, receipt, payment, id) => ({
  id: id || L.uid(), date, desc, receipt, payment,
});

function sample() {
  return L.normalizeData({
    months: {
      '2026-09': { opening: 100000, rows: [
        row('2026-09-02', 'Sales', 500000, 0, 'a'),
        row('2026-09-05', 'Rent', 0, 150000, 'b'),
        row('2026-09-30', 'Sales', 25050, 0, 'c'),
      ] },
      '2026-10': { opening: null, rows: [
        row('2026-10-01', 'Supplies', 0, 40025, 'd'),
        row('2026-10-03', 'sales', 120000, 0, 'e'),
        row('2026-10-10', 'Supplies', 0, 9975, 'f'),
      ] },
    },
  });
}

test('parseMoney: valid inputs', () => {
  assert.equal(L.parseMoney('1500'), 150000);
  assert.equal(L.parseMoney('1,500.50'), 150050);
  assert.equal(L.parseMoney(' 0.1 '), 10);
  assert.equal(L.parseMoney('.5'), 50);
  assert.equal(L.parseMoney('12.'), 1200);
  assert.equal(L.parseMoney(''), 0);
  assert.equal(L.parseMoney(null), 0);
});

test('parseMoney: invalid inputs', () => {
  for (const bad of ['abc', '-5', '1.234', '1..2', '1e5', '12,34.5.6', '9999999999999']) {
    assert.equal(L.parseMoney(bad), null, bad);
  }
});

test('no floating point drift (0.1 + 0.2)', () => {
  const sum = L.parseMoney('0.1') + L.parseMoney('0.2');
  assert.equal(sum, L.parseMoney('0.3'));
  assert.equal(L.formatMoney(sum), '0.30');
});

test('formatMoney / plainMoney', () => {
  assert.equal(L.formatMoney(0), '0.00');
  assert.equal(L.formatMoney(5), '0.05');
  assert.equal(L.formatMoney(123456789), '1,234,567.89');
  assert.equal(L.formatMoney(-50), '-0.50');
  assert.equal(L.plainMoney(123456), '1234.56');
  assert.equal(L.plainMoney(-5), '-0.05');
});

test('date helpers', () => {
  assert.equal(L.daysInMonth('2028-02'), 29);
  assert.equal(L.daysInMonth('2026-02'), 28);
  assert.equal(L.addMonths('2026-12', 1), '2027-01');
  assert.equal(L.addMonths('2026-01', -1), '2025-12');
  assert.equal(L.startOfWeek('2026-10-10'), '2026-10-05'); // Saturday -> Monday
  assert.equal(L.startOfWeek('2026-10-11'), '2026-10-05'); // Sunday -> Monday
  assert.equal(L.startOfWeek('2026-10-05'), '2026-10-05');
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.ok(L.isValidISO('2026-02-28'));
  assert.ok(!L.isValidISO('2026-02-30'));
  assert.ok(!L.isValidISO('26-1-1'));
});

test('running balances, totals and carry-forward', () => {
  const c = L.computeAll(sample());
  const sep = c['2026-09'];
  assert.equal(sep.opening, 100000);
  assert.equal(sep.balances.a, 600000);
  assert.equal(sep.balances.b, 450000);
  assert.equal(sep.balances.c, 475050);
  assert.equal(sep.totalReceipts, 525050);
  assert.equal(sep.totalPayments, 150000);
  assert.equal(sep.closing, 475050);

  const oct = c['2026-10'];
  assert.equal(oct.opening, 475050); // carried from September
  assert.equal(oct.carriedFrom, '2026-09');
  assert.equal(oct.openingIsManual, false);
  assert.equal(oct.closing, 475050 - 40025 + 120000 - 9975);
  assert.equal(oct.net, 120000 - 40025 - 9975);
});

test('manual opening overrides the carried balance', () => {
  const d = sample();
  d.months['2026-10'].opening = 0;
  const c = L.computeAll(d);
  assert.equal(c['2026-10'].opening, 0);
  assert.equal(c['2026-10'].openingIsManual, true);
  assert.equal(c['2026-10'].closing, 120000 - 40025 - 9975);
});

test('skipped months are carried across', () => {
  const d = sample();
  d.months['2026-12'] = { opening: null, rows: [] };
  const c = L.computeAll(d);
  assert.equal(c['2026-12'].opening, c['2026-10'].closing);
  assert.equal(c['2026-12'].carriedFrom, '2026-10');
  assert.deepEqual(L.suggestedOpening(c, '2026-11'), { cents: c['2026-10'].closing, from: '2026-10' });
  assert.deepEqual(L.suggestedOpening(c, '2026-01'), { cents: 0, from: null });
});

test('balanceAtEndOf', () => {
  const d = sample();
  const c = L.computeAll(d);
  assert.equal(L.balanceAtEndOf(d, c, '2026-09-04'), 600000);
  assert.equal(L.balanceAtEndOf(d, c, '2026-09-30'), 475050);
  assert.equal(L.balanceAtEndOf(d, c, '2026-10-02'), 475050 - 40025);
  assert.equal(L.balanceAtEndOf(d, c, '2026-11-15'), c['2026-10'].closing); // carry past last month
  assert.equal(L.balanceAtEndOf(d, c, '2026-08-31'), 0); // before any data
});

test('report: month', () => {
  const r = L.buildReport(sample(), 'month', '2026-10');
  assert.equal(r.labels.length, 31);
  assert.equal(r.totals.receipts, 120000);
  assert.equal(r.totals.payments, 50000);
  assert.equal(r.totals.net, 70000);
  assert.equal(r.totals.opening, 475050);
  assert.equal(r.totals.closing, 475050 + 70000);
  assert.equal(r.receipts[2], 120000); // 3rd
  assert.equal(r.payments[0], 40025); // 1st
  assert.equal(r.balance[30], r.totals.closing);
  // grouping is case-insensitive and sorted by size
  assert.deepEqual(r.paymentSources.map((x) => [x.label, x.amount]), [['Supplies', 50000]]);
  assert.deepEqual(r.receiptSources.map((x) => [x.label, x.amount]), [['sales', 120000]]);
});

test('report: week crossing a month boundary', () => {
  // Mon 28 Sep - Sun 4 Oct 2026
  const r = L.buildReport(sample(), 'week', '2026-10-01');
  assert.equal(r.start, '2026-09-28');
  assert.equal(r.end, '2026-10-04');
  assert.equal(r.labels.length, 7);
  assert.equal(r.totals.receipts, 25050 + 120000);
  assert.equal(r.totals.payments, 40025);
  assert.equal(r.totals.opening, 450000); // balance after 5 Sep (Rent), before 30 Sep
  assert.equal(r.totals.closing, 475050 - 40025 + 120000);
  assert.equal(r.balance[6], r.totals.closing);
});

test('report: year', () => {
  const r = L.buildReport(sample(), 'year', '2026');
  assert.equal(r.labels.length, 12);
  assert.equal(r.receipts[8], 525050); // Sep
  assert.equal(r.payments[8], 150000);
  assert.equal(r.receipts[9], 120000); // Oct
  assert.equal(r.totals.receipts, 645050);
  assert.equal(r.totals.payments, 200000);
  assert.equal(r.balance[8], 475050); // end Sep
  assert.equal(r.balance[11], r.totals.closing); // carried to Dec
  assert.equal(r.balance[0], 0); // before any data
});

test('report: empty data does not crash', () => {
  const d = L.defaultData();
  for (const [p, a] of [['week', '2026-10-10'], ['month', '2026-10'], ['year', '2026']]) {
    const r = L.buildReport(d, p, a);
    assert.equal(r.totals.receipts, 0);
    assert.equal(r.count, 0);
  }
});

test('rows with a bad date still count (placed on the 1st of their month)', () => {
  const d = L.normalizeData({
    months: { '2026-10': { opening: 0, rows: [row('', 'x', 1000, 0, 'z'), row('2026-11-05', 'y', 500, 0, 'w')] } },
  });
  const r = L.buildReport(d, 'month', '2026-10');
  assert.equal(r.totals.receipts, 1500);
  assert.equal(r.receipts[0], 1500);
});

test('normalizeData cleans bad input', () => {
  const d = L.normalizeData({
    settings: { businessName: 42, currency: 'USD' },
    months: {
      'bad-key': { rows: [] },
      '2026-10': { opening: 'x', rows: [null, { id: 'dup', receipt: -5, payment: 1.5 }, { id: 'dup', receipt: 100 }] },
    },
  });
  assert.equal(d.settings.businessName, 'My Business');
  assert.equal(d.settings.currency, 'USD');
  assert.deepEqual(Object.keys(d.months), ['2026-10']);
  const rows = d.months['2026-10'].rows;
  assert.equal(d.months['2026-10'].opening, null);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].receipt, 0); // negative rejected
  assert.equal(rows[0].payment, 0); // non-integer rejected
  assert.notEqual(rows[0].id, rows[1].id); // duplicate id regenerated
  assert.deepEqual(L.normalizeData(null), L.defaultData());
});

test('CSV export', () => {
  const d = sample();
  d.months['2026-10'].rows[0].desc = 'Paper, "A4"';
  const lines = L.monthToCSV(d, '2026-10').trim().split('\r\n');
  assert.equal(lines[0], 'Date,Description,Receipts,Payments,Balance');
  assert.equal(lines[1], ',Opening balance,,,4750.50');
  assert.equal(lines[2], '2026-10-01,"Paper, ""A4""",,400.25,4350.25');
  assert.equal(lines[lines.length - 1], ',TOTAL,1200.00,500.00,5450.50');
});
