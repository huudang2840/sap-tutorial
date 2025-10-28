const express = require('express')
const app = express()

app.use(express.json())

// Mock Data
const stockDB = {
  'SKU-RED': 50,
  'SKU-VN':  7,
  'SKU-BLUE': 999,
  'SKU-BLK': 20
}

// endpoint POST /stock
// body: { "sku": "SKU-RED" }
// response: { "sku": "SKU-RED", "availableQty": 50 }
app.post('/stock', (req, res) => {
  const { sku } = req.body
  const qty = stockDB[sku] ?? 0
  res.json({
    sku,
    availableQty: qty
  })
})

const PORT = 5000
app.listen(PORT, () => {
  console.log(`Mock Stock Service running on http://localhost:${PORT}`)
})
