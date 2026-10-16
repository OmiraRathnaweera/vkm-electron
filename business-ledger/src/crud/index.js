module.exports = {
  addMonth: require("./create/addMonth"),
  addRow: require("./create/addRow"),
  getMonth: require("./read/getMonth"),
  getRow: require("./read/getRow"),
  listMonths: require("./read/listMonths"),
  getMonthSummary: require("./read/getMonthSummary"),
  updateRow: require("./update/updateRow"),
  setOpening: require("./update/setOpening"),
  sortRows: require("./update/sortRows"),
  updateSettings: require("./update/updateSettings"),
  deleteRow: require("./delete/deleteRow"),
  deleteMonth: require("./delete/deleteMonth"),
};
