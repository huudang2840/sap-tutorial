const cds = require('@sap/cds')
const { Orders, OrderItems } = cds.entities
const axios = require('axios')

// Helper function to fetch stock with retry logic
async function fetchStockWithRetry(baseURL, sku, maxRetry = 2) {
    for (let attempt = 1; attempt <= maxRetry; attempt++) {
        try {
            const resp = await axios.post(`${baseURL}/stock`, { sku })
            return { ok: true, data: resp.data }
        } catch (e) {
            if (attempt === maxRetry) {
                return {
                    ok: false,
                    data: { sku, availableQty: null }
                }
            }
            await new Promise(r => setTimeout(r, 100))
        }
    }
}

class OrderService extends cds.ApplicationService {
    async init() {

        // Stock Service Configuration
        const stockSvcConf = cds.env.requires.stockService
        const stockBaseURL = stockSvcConf?.credentials?.url
        const messaging = await cds.connect.to('messaging')


        // 1. Validation before CREATE Order
        this.before('CREATE', 'Orders', req => {
            const data = req.data
            if (!data.items || data.items.length === 0) {
                req.reject(400, 'Order must have at least 1 item')
            }
            for (const it of data.items) {
                if (it.qty <= 0) req.reject(400, 'Quantity must be > 0')
            }
            data.createdAt = new Date().toISOString()
        })

        // 2. Action submitOrder: calculate total from OrderItems
        this.on('submitOrder', async req => {
            const { orderID } = req.data
            const tx = cds.transaction(req)

            const orderRow = await tx.run(
                SELECT.one.from(Orders).where({ ID: orderID })
            )
            if (!orderRow) {
                return {
                    success: false,
                    message: `Order ${orderID} not found`
                }
            }

            const items = await tx.run(
                SELECT.from(OrderItems).where({ parent_ID: orderID })
            )
            if (!items.length) {
                return {
                    success: false,
                    message: `Order ${orderID} has no items`
                }
            }

            const total = items.reduce(
                (sum, it) => sum + Number(it.qty) * Number(it.price),
                0
            )

            await tx.run(
                UPDATE(Orders).set({ total }).where({ ID: orderID })
            )

            // 5. Emit OrderSubmitted event after order is finalized
            await cds.emit('OrderSubmitted', {
                orderId: orderID,
                total: total,
                itemCount: items.length,
                submittedAt: new Date().toISOString()
            })

            // Using Messaging API to emit event
           const result = await messaging.emit('OrderCompleted', {
                orderId: orderID,
                total: total,
                customer: orderRow.customer,
                completedAt: new Date().toISOString()
            })

            console.log('Messaging emit result:', result)

            console.log('[order-service] Emitted OrderSubmitted for', orderID)

            // 6. Trả về response cho client
            return {
                success: true,
                message: `Order ${orderID} submitted, total=${total}`
            }
        })
        // 3. Action getHighValueOrders: query DB with CAP SELECT
        this.on('getHighValueOrders', async req => {
            const { minTotal } = req.data
            const tx = cds.transaction(req)
            const rows = await tx.run(
                SELECT.from(Orders).where`total >= ${minTotal}`
            )
            return rows
        })

        // 4. Action checkStock: call external service (mock)
        this.on('checkStock', async req => {
            const { sku } = req.data

            if (!stockBaseURL) {
                req.error(500, 'stockService is not configured')
            }

            try {
                const resp = await fetchStockWithRetry(stockBaseURL, sku)
                return resp.data
            }
            catch (err) {
                req.error(500, 'Failed to check stock: ' + err.message)
            }
        })

        //5. Action getOrderWithStock: get order and check stock for each item
        this.on('getOrderWithStock', async req => {
            const { orderID } = req.data
            const tx = cds.transaction(req)


            const order = await tx.run(
                SELECT.one.from(Orders).where({ ID: orderID })
            )
            if (!order) {
                req.error(404, `Order ${orderID} not found`)
            }
            const items = await tx.run(
                SELECT.from(OrderItems).where({ parent_ID: orderID })
            )
            const stockReport = []
            for (const it of items) {
                try {
                    const resp = await fetchStockWithRetry(stockBaseURL, it.sku)
                    stockReport.push(`Item ${it.sku}: availableQty=${resp.data.availableQty}`)
                }
                catch (err) {
                    stockReport.push(`Item ${it.sku}: failed to check stock`)
                }
            }
            return {
                orderID: order.ID,
                customer: order.customer,
                items: JSON.stringify(items),
                stockReport: stockReport.join('; ')
            }
        })

        // 6. after READ: enrich response
        this.after('READ', 'Orders', rows => {
            const arr = Array.isArray(rows) ? rows : [rows]
            for (const o of arr) {
                o.note = 'Thank you for shopping!' // virtual field at runtime
            }
        })


        return super.init()
    }
}

module.exports = { OrderService }
