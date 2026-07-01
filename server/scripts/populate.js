require('dotenv').config({ path: '/Users/liuxiong/thai-tax-system/server/.env' });
const { pool } = require('/Users/liuxiong/thai-tax-system/server/src/db');
const r2 = n => Math.round(n * 100) / 100;

async function main() {
  // Clean old LS001
  await pool.query("DELETE FROM expense_details WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM vat_output_details WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM vat_input_details WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM ecommerce_sales WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM social_security_records WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM employees WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM pnd1_reports WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM exchange_rates WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM accounting_periods WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM audit_logs WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM platform_raw_orders WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM platform_imports WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM tax_calendar WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM compliance_settings WHERE company_id IN (SELECT id FROM companies WHERE code='LS001')");
  await pool.query("DELETE FROM companies WHERE code='LS001'");
  console.log('Cleaned old data');

  // === Step 1: Create Company ===
  const comp = await pool.query(
    `INSERT INTO companies (code,name,tax_id,vat_number,vat_registered,contact_person,phone,wechat,email,address_th,business_type,platforms,service_start_date,monthly_service_fee,tags,accounting_start)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    ['LS001','蓝鲨科技（泰国）有限公司','0123456789012','0234567890123',true,'刘总','+66-81-234-5678','lansha_ceo','ceo@lansha-tech.com','123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110','电商',['Shopee','Lazada','TikTok'],'2025-06-01',5000,['重点客户','Shopee大卖'],'2025-01-01']
  );
  const companyId = comp.rows[0].id;
  console.log('1️⃣ 公司:', companyId, comp.rows[0].name);

  // === Step 2: Periods ===
  const periodMap = {};
  for (let m = 1; m <= 6; m++) {
    const p = await pool.query('INSERT INTO accounting_periods (company_id,year,month,status) VALUES ($1,$2,$3,$4) RETURNING *', [companyId,2025,m,'draft']);
    periodMap[m] = p.rows[0].id;
  }
  console.log('2️⃣ 期间: 1-6月 created');

  // === Step 3: Exchange rates ===
  for (let m = 1; m <= 12; m++)
    await pool.query('INSERT INTO exchange_rates (company_id,month,year,rate_thb_cny,rate_cny_thb,source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (company_id,year,month) DO UPDATE SET rate_thb_cny=$4,rate_cny_thb=$5',
      [companyId,m,2025,4.5000,0.2222,'manual']);
  console.log('3️⃣ 汇率: 全年 4.50');

  // === Step 4: Sales data ===
  const salesData = {
    1:[350000,5000,17500,10000,8000,150000,30000,63530,12000,5000,0,0],
    2:[420000,8000,21000,12000,10000,180000,30000,63530,12000,6000,0,0],
    3:[510000,3000,25500,15000,12000,220000,30000,63530,15000,8000,24500,0],
    4:[480000,10000,24000,18000,11000,200000,30000,63530,14000,7000,0,0],
    5:[550000,6000,27500,20000,14000,240000,30000,63530,16000,9000,18900,0],
    6:[620000,12000,31000,22000,15000,260000,30000,63530,18000,10000,0,0]
  };
  for (let m = 1; m <= 6; m++) {
    const [ps,pr,pf,af,sf,cog,rf,sl,wf,oe,ivp,idp] = salesData[m];
    await pool.query(
      `INSERT INTO ecommerce_sales (company_id,period_id,platform_sales,platform_refunds,platform_fees,advertising_fees,shipping_fees,cost_of_goods,rental_fees,salary_fees,warehouse_fees,other_expenses,import_vat_paid,import_duty_paid)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (company_id,period_id) DO UPDATE SET platform_sales=$3,platform_refunds=$4,platform_fees=$5,advertising_fees=$6,shipping_fees=$7,cost_of_goods=$8,rental_fees=$9,salary_fees=$10,warehouse_fees=$11,other_expenses=$12,import_vat_paid=$13,import_duty_paid=$14`,
      [companyId,periodMap[m],ps,pr,pf,af,sf,cog,rf,sl,wf,oe,ivp,idp]
    );
    const gross = ps - pr;
    console.log(`4️⃣ ${m}月: 含税${gross.toLocaleString()} → 不含税${r2(gross/1.07).toLocaleString()} 销项VAT=${r2(gross/1.07*0.07).toLocaleString()}`);
  }

  // === Step 5: VAT details ===
  const outEntries = [
    ['2025-01-05','张三','蓝牙耳机',50000,3500,53500],
    ['2025-01-10','李四','手机壳',25000,1750,26750],
    ['2025-01-15','王五','充电宝',30000,2100,32100],
    ['2025-01-20','赵六','数据线',15000,1050,16050],
    ['2025-01-25','钱七','智能手表',42000,2940,44940]
  ];
  for (const [d,cn,desc,aev,vat,total] of outEntries)
    await pool.query('INSERT INTO vat_output_details (company_id,period_id,invoice_date,customer_name,description,amount_ex_vat,vat_amount,total_amount,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [companyId,periodMap[1],d,cn,desc,aev,vat,total,'manual']);
  const outVat = outEntries.reduce((s,e)=>s+e[5],0);
  console.log(`5️⃣ 销项: ${outEntries.length}条, VAT=${outVat.toLocaleString()}`);

  const inEntries = [
    ['2025-01-08','某物业','rental',28000,1960,true],
    ['2025-01-12','Facebook','advertising',10000,700,true],
    ['2025-01-18','某物流公司','shipping',8000,560,true],
    ['2025-01-22','某供应商','purchase',150000,10500,true],
    ['2025-01-28','某服务商','service',5000,350,true]
  ];
  for (const [d,sn,cat,aev,vat,ded] of inEntries)
    await pool.query('INSERT INTO vat_input_details (company_id,period_id,invoice_date,supplier_name,category,amount_ex_vat,vat_amount,total_amount,deductible) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [companyId,periodMap[1],d,sn,cat,aev,vat,aev+vat,ded]);
  const inVat = inEntries.reduce((s,e)=>s+e[4],0);
  console.log(`5️⃣ 进项: ${inEntries.length}条, VAT=${inVat.toLocaleString()}`);
  console.log(`5️⃣ VAT对账: 销项${outVat} - 进项${inVat} = 留抵${inVat-outVat}`);

  // === Step 6: Employees ===
  const emps = [
    ['EMP001','张三','ไทย','运营经理',35000,15000],
    ['EMP002','李四','ไทย','仓库管理员',13530,13530],
    ['EMP003','王五','中国','总经理',65000,15000]
  ];
  const empIds = {};
  for (const [ec,en,enat,epos,esal,essb] of emps) {
    const r = await pool.query('INSERT INTO employees (company_id,employee_code,full_name,nationality,position,salary,social_security_base,start_date,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [companyId,ec,en,enat,epos,esal,essb,'2025-01-01',true]);
    empIds[ec] = r.rows[0].id;
    console.log(`6️⃣ ${en}: id=${r.rows[0].id} 月薪${esal.toLocaleString()}`);
  }

  // === Step 7: Social Security ===
  let ssTotal = 0;
  for (const [ec,en,enat,epos,esal,essb] of emps) {
    const ssb = Math.min(esal,15000);
    const empEr = r2(ssb*0.05);
    const empEe = r2(ssb*0.05);
    const tot = r2(empEr+empEe);
    await pool.query(`INSERT INTO social_security_records (company_id,employee_id,period_id,salary,ss_base,employer_contribution,employee_contribution,total_contribution,paid,paid_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (employee_id,period_id) DO UPDATE SET salary=$4,ss_base=$5,employer_contribution=$6,employee_contribution=$7,total_contribution=$8,paid=$9,paid_date=$10`,
      [companyId,empIds[ec],periodMap[1],esal,ssb,empEr,empEe,tot,true,'2025-02-15']);
    console.log(`7️⃣ ${en}: 基数${ssb} 雇主${empEr} 员工${empEe} 合计${tot}`);
    ssTotal += tot;
  }
  console.log(`7️⃣ 社保合计: ${r2(ssTotal)}`);

  // === Step 8: PND.1 ===
  const PIT_BRACKETS = [
    {t:150000,r:0},{t:300000,r:0.05},{t:500000,r:0.10},{t:750000,r:0.15},
    {t:1000000,r:0.20},{t:2000000,r:0.25},{t:5000000,r:0.30},{t:Infinity,r:0.35}
  ];
  function pitTax(income){
    let tax=0,rem=income,prev=0;
    for(const b of PIT_BRACKETS){const amt=Math.min(rem,b.t-prev);if(amt<=0)break;tax+=amt*b.r;rem-=amt;prev=b.t;}
    return r2(tax);
  }
  let totalWht=0,totalSalary=0;
  for(const[ec,en,enat,epos,esal]of emps){
    const ann=esal*12,expDed=Math.min(ann*0.5,100000),taxable=Math.max(0,ann-expDed-60000);
    const annTax=pitTax(taxable),monthWht=r2(annTax/12);
    console.log(`8️⃣ ${en}: 月薪${esal.toLocaleString()} 年应税${taxable.toLocaleString()} 月预扣${monthWht.toLocaleString()}THB`);
    totalWht+=monthWht;totalSalary+=esal;
  }
  console.log(`8️⃣ 总预扣: ${r2(totalWht).toLocaleString()}`);
  await pool.query(`INSERT INTO pnd1_reports (company_id,period_id,total_salary,total_wht,employee_count,status) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (company_id,period_id) DO UPDATE SET total_salary=$3,total_wht=$4,employee_count=$5,status=$6`,
    [companyId,periodMap[1],r2(totalSalary),r2(totalWht),emps.length,'filed']);
  console.log('8️⃣ PND.1 已保存');

  // === Step 9: Profit Loss calc ===
  const s = salesData[1];
  const gross = s[0]-s[1];
  const netExVat = gross/1.07;
  const cogsTotal = s[5]+s[2]+s[4]; // cog+platform_fees+shipping
  const grossProfit = netExVat - cogsTotal;
  const expTotal = s[6]+s[7]+s[8]+s[9]+s[3]; // rent+salary+warehouse+other+advertising
  const netProfit = grossProfit - expTotal;
  console.log(`9️⃣ 利润表: 收入${r2(netExVat).toLocaleString()} - 成本${cogsTotal.toLocaleString()} = 毛利${r2(grossProfit).toLocaleString()} - 费用${expTotal.toLocaleString()} = 净利润${r2(netProfit).toLocaleString()}THB`);

  // === Step 11: Audit Report ===
  console.log('⑪ 稽查报告: 需通过前端生成 PDF');

  // === Step 12: Compliance Settings & Calendar ===
  await pool.query(`INSERT INTO compliance_settings (company_id,vat_registered,has_employees,has_rental_expense,has_foreign_payment,vat_threshold_alert,reminder_days)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (company_id) DO UPDATE SET vat_registered=$2,has_employees=$3,has_rental_expense=$4,has_foreign_payment=$5`,
    [companyId,true,true,true,false,true,3]);
  console.log('⑫ 合规设置已保存');

  console.log('\n═══════════════════════════');
  console.log('✅ 蓝鲨科技全流程数据录入完成!');
  console.log('companyId:', companyId);
  console.log('═══════════════════════════');

  await pool.end();
}
main().catch(e => { console.error('Error:', e.message); process.exit(1); });
