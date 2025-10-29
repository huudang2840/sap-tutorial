const cds = require( '@sap/cds' )

class analytics extends cds.ApplicationService {
  async init () {

    // Register event handler for 'OrderSubmitted' events
    cds.on( 'OrderSubmitted', async payload => {
      try
      {
        console.log( "[analytics] Received OrderSubmitted (in-process):", payload.orderId )

        const {orderId, total, itemCount, submittedAt, customer} = payload

        const {OrderEventLog} = cds.entities
        const db = await cds.connect.to( 'db' )

        await db.run(
          INSERT.into( OrderEventLog ).entries( {
            ID: cds.utils.uuid(),
            orderId,
            total,
            itemCount,
            customer,
            submittedAt,
            receivedAt: new Date().toISOString()
          } )
        )

        console.log( '[analytics] Logged OrderSubmitted (in-process):', orderId )
      } catch( e )
      {
        console.error( '[analytics] Failed to log OrderSubmitted:', e )
      }
    } )

    return super.init()
  }
}

module.exports = {analytics}
