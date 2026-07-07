// ===== 泰国个人所得税 — 费用扣除 =====

/**
 * 计算费用扣除额
 * @param {number} annualIncome 年收入
 * @param {string} incomeType 收入类型
 *   - '40_1_2': 工资/劳务 → MIN(收入×50%, 100,000)
 *   - '40_5_6_7': 租金/职业→ MIN(收入×60%, 60,000)
 *   - '40_4': 利息 → 0
 *   - '40_8': 经营所得 → MIN(收入×60%, 60,000)
 * @returns {number}
 */
function calcExpenseDeduction(annualIncome, incomeType = '40_1_2') {
  const income = parseFloat(annualIncome) || 0;
  switch (incomeType) {
    case '40_1_2':
      return Math.min(income * 0.5, 100000);
    case '40_5_6_7':
    case '40_8':
      return Math.min(income * 0.6, 60000);
    case '40_4':
    default:
      return 0;
  }
}

module.exports = { calcExpenseDeduction };
