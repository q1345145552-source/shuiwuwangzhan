// ===== 泰国个人所得税 — 7级累进税率 =====

/**
 * 泰国 PIT 累进税率表（年化）
 * 0-150k → 0% | 150k-300k → 5% | 300k-500k → 10% | 500k-750k → 15%
 * 750k-1M → 20% | 1M-2M → 25% | 2M-5M → 30% | >5M → 35%
 */
const PIT_BRACKETS = [
  { upTo: 150000,  rate: 0.00, label: '0–150,000' },
  { upTo: 300000,  rate: 0.05, label: '150,001–300,000' },
  { upTo: 500000,  rate: 0.10, label: '300,001–500,000' },
  { upTo: 750000,  rate: 0.15, label: '500,001–750,000' },
  { upTo: 1000000, rate: 0.20, label: '750,001–1,000,000' },
  { upTo: 2000000, rate: 0.25, label: '1,000,001–2,000,000' },
  { upTo: 5000000, rate: 0.30, label: '2,000,001–5,000,000' },
  { upTo: Infinity, rate: 0.35, label: '>5,000,000' },
];

/**
 * 计算年税 + 分档明细
 * @param {number} taxableIncome 应税净收入
 * @returns {{ annualTax: number, brackets: Array<{range: string, amount: number, rate: number, tax: number}> }}
 */
function calcAnnualTax(taxableIncome) {
  let annualTax = 0;
  const brackets = [];
  let remaining = taxableIncome;
  let prev = 0;

  for (const b of PIT_BRACKETS) {
    const slice = Math.min(Math.max(0, remaining), b.upTo - prev);
    const tax = slice * b.rate;
    if (slice > 0 || b.upTo === Infinity) {
      brackets.push({
        range: b.label,
        amount: parseFloat(slice.toFixed(2)),
        rate: b.rate,
        tax: parseFloat(tax.toFixed(2)),
      });
    }
    annualTax += tax;
    remaining -= slice;
    prev = b.upTo;
    if (remaining <= 0 && b.upTo !== Infinity) continue;
  }

  return {
    annualTax: parseFloat(annualTax.toFixed(2)),
    brackets,
  };
}

module.exports = { calcAnnualTax, PIT_BRACKETS };
