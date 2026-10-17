const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/logic.js');

const addSalesMonth = require('../src/crud/create/addSalesMonth.js');
const addSalesRow = require('../src/crud/create/addSalesRow.js');
const listSalesMonths = require('../src/crud/read/listSalesMonths.js');
const getSalesSummary = require('../src/crud/read/getSalesSummary.js');
const updateSalesRow = require('../src/crud/update/updateSalesRow.js');
const sortSalesRows = require('../src/crud/update/sortSalesRows.js');
const deleteSalesRow = require('../src/crud/delete/deleteSalesRow.js');
const deleteSalesMonth = require('../src/crud/delete/deleteSalesMonth.js');

test('formatQty: cubic volume formatting', () => {
  assert.equal(L.formatQty(0), '0');
  assert.equal(L.formatQty(250), '2.5');
  assert.equal(L.formatQty(205), '2.05');
  assert.equal(L.formatQty(1200), '12');
  assert.equal(L.formatQty(123456), '1,234.56');
  assert.equal(L.formatQty(-250), '-2.5');
});

test('computeSalesMonth and salesMonthToCSV', () => {
  const data = L.defaultData();
  addSalesMonth(data, '2026-10');
  const addRes = addSalesRow(data, '2026-10', { date: '2026-10-01' });
  assert.ok(addRes.ok);
  const rowId = addRes.row.id;

  updateSalesRow(data, '2026-10', rowId, 'Chips.cubes', '2.5');
  updateSalesRow(data, '2026-10', rowId, 'Chips.price', '500');
  updateSalesRow(data, '2026-10', rowId, 'ABC.cubes', '1');
  updateSalesRow(data, '2026-10', rowId, 'ABC.price', '200');

  const summary = getSalesSummary(data, '2026-10');
  assert.equal(summary.perStone.Chips.cubes, 250);
  assert.equal(summary.perStone.Chips.sales, 50000);
  assert.equal(summary.perStone.ABC.cubes, 100);
  assert.equal(summary.perStone.ABC.sales, 20000);
  assert.equal(summary.rowTotals[rowId], 70000);
  assert.equal(summary.totalCubes, 350);
  assert.equal(summary.totalSales, 70000);

  const csv = L.salesMonthToCSV(data, '2026-10');
  assert.ok(csv.includes('Date,ABC Cubes,ABC Price,Chips Cubes'));
  assert.ok(csv.includes('2026-10-01'));
  assert.ok(csv.includes('700.00'));
});

test('sales CRUD lifecycle', () => {
  const data = L.defaultData();

  // add month
  const m1 = addSalesMonth(data, '2026-09');
  const m2 = addSalesMonth(data, '2026-10');
  assert.ok(m1.ok && m2.ok);
  assert.deepEqual(listSalesMonths(data), ['2026-10', '2026-09']);

  // duplicate month rejection
  const dup = addSalesMonth(data, '2026-10');
  assert.ok(!dup.ok);

  // add rows
  const r1 = addSalesRow(data, '2026-10', { date: '2026-10-05' });
  const r2 = addSalesRow(data, '2026-10', { date: '2026-10-02' });
  assert.ok(r1.ok && r2.ok);

  // sort rows
  sortSalesRows(data, '2026-10');
  assert.equal(data.sales['2026-10'].rows[0].date, '2026-10-02');
  assert.equal(data.sales['2026-10'].rows[1].date, '2026-10-05');

  // update validations
  const badDate = updateSalesRow(data, '2026-10', r1.row.id, 'date', '2026-11-01');
  assert.ok(!badDate.ok);

  const badNum = updateSalesRow(data, '2026-10', r1.row.id, 'Chips.cubes', '-5');
  assert.ok(!badNum.ok);

  // delete row
  const delRow = deleteSalesRow(data, '2026-10', r1.row.id);
  assert.ok(delRow.ok);
  assert.equal(data.sales['2026-10'].rows.length, 1);

  // delete month
  const delMonth = deleteSalesMonth(data, '2026-10');
  assert.ok(delMonth.ok);
  assert.equal(data.sales['2026-10'], undefined);
});

test('normalizeData preserves and cleans sales data', () => {
  const normalized = L.normalizeData({
    sales: {
      'bad-month': { rows: [] },
      '2026-10': {
        rows: [
          null,
          {
            id: 'x1',
            date: '2026-10-01',
            items: {
              Chips: { cubes: 250, price: 50000 },
              'invalid-stone': { cubes: 999 },
            },
          },
        ],
      },
    },
  });

  assert.equal(normalized.sales['bad-month'], undefined);
  assert.ok(normalized.sales['2026-10']);
  assert.equal(normalized.sales['2026-10'].rows.length, 1);
  assert.equal(normalized.sales['2026-10'].rows[0].items.Chips.cubes, 250);
  assert.equal(normalized.sales['2026-10'].rows[0].items.Chips.price, 50000);
  assert.equal(normalized.sales['2026-10'].rows[0].items.ABC.cubes, 0);
});
