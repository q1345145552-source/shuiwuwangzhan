const Joi = require('joi');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error } = schema.validate(req[source], { allowUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    next();
  };
}

// 公司信息校验
const companySchema = Joi.object({
  code: Joi.string().required().max(20).messages({
    'string.empty': '公司代码不能为空',
    'string.max': '公司代码最长20位',
  }),
  name: Joi.string().required().max(200).messages({
    'string.empty': '公司名称不能为空',
    'string.max': '公司名称最长200字符',
  }),
  tax_id: Joi.string().allow('').max(20).pattern(/^\d*$/).messages({
    'string.pattern.base': '税号必须为纯数字',
  }),
  vat_id: Joi.string().allow('').max(20),
  contact_person: Joi.string().allow('').max(100),
  phone: Joi.string().allow('').max(30),
  wechat: Joi.string().allow('').max(50),
  email: Joi.string().allow('').email().max(100).messages({
    'string.email': '邮箱格式不正确',
  }),
  monthly_service_fee: Joi.number().min(0).max(999999).messages({
    'number.min': '月服务费不能为负数',
    'number.max': '月服务费不能超过999999',
  }),
  business_type: Joi.string().allow('').max(100),
  platforms: Joi.alternatives().try(
    Joi.string().allow('').max(200),
    Joi.array().items(Joi.string()).max(20)
  ),
  service_start_date: Joi.date().allow(null),
  tags: Joi.alternatives().try(
    Joi.string().allow('').max(200),
    Joi.array().items(Joi.string()).max(20)
  ),
  thai_address: Joi.string().allow('').max(500),
});

// 电商销售数据校验
const ecommerceSaleSchema = Joi.object({
  company_id: Joi.number().integer().required(),
  period_id: Joi.number().integer().required(),
  platform_sales: Joi.number().min(0).allow(null),
  refunds: Joi.number().min(0).allow(null),
  platform_commission: Joi.number().min(0).allow(null),
  advertising: Joi.number().min(0).allow(null),
  shipping: Joi.number().min(0).allow(null),
  purchase_cost: Joi.number().min(0).allow(null),
  rent: Joi.number().min(0).allow(null),
  salary: Joi.number().min(0).allow(null),
  warehouse_fee: Joi.number().min(0).allow(null),
  other_expenses: Joi.number().min(0).allow(null),
  import_vat: Joi.number().min(0).allow(null),
  import_duty: Joi.number().min(0).allow(null),
});

// 销项明细批量校验
const vatOutputBatchSchema = Joi.object({
  company_id: Joi.number().integer().required(),
  period_id: Joi.number().integer().required(),
  entries: Joi.array().items(Joi.object({
    entry_date: Joi.date().required().messages({ 'date.base': '日期格式不正确' }),
    customer_name: Joi.string().allow('').max(200),
    product_name: Joi.string().allow('').max(200),
    amount_ex_vat: Joi.number().min(0).required().messages({ 'number.min': '不含税金额不能为负数' }),
  })),
});

// 费用批量校验
const expensesBatchSchema = Joi.object({
  company_id: Joi.number().integer().required(),
  period_id: Joi.number().integer().required(),
  entries: Joi.array().items(Joi.object({
    entry_date: Joi.date().required(),
    supplier_name: Joi.string().required().max(200).messages({ 'string.empty': '供应商名称不能为空' }),
    category: Joi.string().required().max(50).messages({ 'string.empty': '费用类别不能为空' }),
    amount_ex_vat: Joi.number().min(0).required(),
    vat_amount: Joi.number().min(0).allow(0),
    is_deductible: Joi.boolean().allow(null),
  })),
});

module.exports = {
  validate,
  companySchema,
  ecommerceSaleSchema,
  vatOutputBatchSchema,
  expensesBatchSchema,
};
