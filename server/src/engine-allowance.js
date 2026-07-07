// ===== 泰国个人所得税 — 减免项汇总 =====

/**
 * 计算所有减免项合计
 *
 * @param {object} params
 * @param {number} [params.selfAllowance=60000]    个人免税额
 * @param {number} [params.spouseAllowance=0]       配偶免税额（配偶无收入才有）
 * @param {number} [params.childrenCount=0]         子女数量（每个 30,000）
 * @param {number} [params.parentsCount=0]          赡养老人数量（每个 30,000）
 * @param {number} [params.ssDeduction=0]           社保年扣缴（上限 9,000）
 * @param {number} [params.lifeInsurance=0]         人寿保险（上限 100,000）
 * @param {number} [params.healthInsurance=0]       健康保险（上限 25,000）
 * @param {number} [params.mortgageInterest=0]      房贷利息（上限 100,000）
 * @param {number} [params.pensionInsurance=0]      养老金保险（无上限）
 * @param {number} [params.donationDouble=0]        双倍扣除捐款
 * @param {number} [params.donationNormal=0]        普通捐款
 * @returns {{ total: number, breakdown: Array<{name: string, amount: number}> }}
 */
function calcTotalAllowance(params = {}) {
  const breakdown = [];

  const add = (name, amount) => {
    if (amount > 0) breakdown.push({ name, amount: parseFloat(amount.toFixed(2)) });
    return amount;
  };

  // 个人免税额：固定 60,000
  const self = add('个人免税额', params.selfAllowance || 60000);

  // 配偶免税额：已婚且配偶无收入才有
  const spouse = add('配偶免税额', params.spouseAllowance || 0);

  // 子女：每人 30,000
  const children = add(
    `子女免税额 (${params.childrenCount || 0}人)`,
    (params.childrenCount || 0) * 30000
  );

  // 赡养老人：每人 30,000
  const parents = add(
    `赡养老人 (${params.parentsCount || 0}人)`,
    (params.parentsCount || 0) * 30000
  );

  // 社保：上限 9,000
  const ss = add('社保扣除', Math.min(params.ssDeduction || 0, 9000));

  // 人寿保险：上限 100,000
  const lifeIns = add('人寿保险', Math.min(params.lifeInsurance || 0, 100000));

  // 健康保险：上限 25,000
  const healthIns = add('健康保险', Math.min(params.healthInsurance || 0, 25000));

  // 房贷利息：上限 100,000
  const mortgage = add('房贷利息', Math.min(params.mortgageInterest || 0, 100000));

  // 养老金保险：无上限（注：和寿险共享 100,000 上限，但可额外抵 200,000 退休基金）
  // 此处不做联合上限校验，调用方自行控制
  const pension = add('养老金', params.pensionInsurance || 0);

  // 捐款（单独处理，不算在 allowance 里，但放在这里输出）
  // 实际上捐款在 taxableIncome 那一步单独减，此处只计减免项

  const total = breakdown.reduce((s, i) => s + i.amount, 0);

  return { total: parseFloat(total.toFixed(2)), breakdown };
}

module.exports = { calcTotalAllowance };
