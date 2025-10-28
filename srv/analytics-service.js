const cds = require('@sap/cds')

class analytics extends cds.ApplicationService {
  async init() {

    cds.on('OrderSubmitted', async payload => {
      try {
        if (!payload || !payload.orderId) {
          console.warn('[analytics] Malformed OrderSubmitted payload:', payload)
          return
        }

        const { orderId, total, itemCount, submittedAt } = payload
        const { OrderEventLog } = cds.entities

        // Get connection to db, don't use cds.tx(payload) to avoid locking issues
        const db = await cds.connect.to('db')

        // Recodrd log with db.run() -> autocommit, no hanging locks
        await db.run(
          INSERT.into(OrderEventLog).entries({
            ID         : cds.utils.uuid(),
            orderId,
            total,
            itemCount,
            submittedAt,
            receivedAt : new Date().toISOString()
          })
        )

        console.log('[analytics] Logged OrderSubmitted for', orderId)
      } catch (e) {
        console.error('[analytics] Failed to log OrderSubmitted:', e)
      }
    })

    return super.init()
  }
}

module.exports = { analytics }
