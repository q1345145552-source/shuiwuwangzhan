const express = require('express');
const router = express.Router();

// Simplified accounts - chart_of_accounts table is no longer used in e-commerce mode
router.get('/', (req, res) => {
  // Return empty list since we're in e-commerce mode (no accounting ledger)
  res.json([]);
});

router.post('/', (req, res) => {
  res.status(400).json({ error: '科目功能在电商模式下已禁用' });
});

module.exports = router;
