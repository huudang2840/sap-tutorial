const cds = require( '@sap/cds' )
const axios = require( 'axios' )

async function fetchStockWithRetry ( baseURL, sku, maxRetry = 2 ) {
    for( let attempt = 1; attempt <= maxRetry; attempt++ )
    {
        try
        {
            const resp = await axios.post( `${ baseURL }/stock`, {sku} )
            return {ok: true, data: resp.data}
        } catch( e )
        {
            if( attempt === maxRetry )
            {
                return {
                    ok: false,
                    data: {sku, availableQty: null}
                }
            }
            await new Promise( r => setTimeout( r, 100 ) )
        }
    }
}

class OrderService extends cds.ApplicationService {
    async init () {
        // External stock service config
        const stockSvcConf = cds.env.requires.stockService
        const stockBaseURL = stockSvcConf?.credentials?.url

        // Messaging channel (could be file-based-messaging / enterprise-messaging)
        // If not configured, cds.connect.to('messaging') will throw, so wrap in try/catch
        let messaging = null
        try
        {
            messaging = await cds.connect.to( 'messaging' )
        } catch( err )
        {
            console.warn( '[order-service] messaging not available, running in-process only' )
        }

        // 1. Validate before CREATE Orders
        this.before( 'CREATE', 'Orders', req => {
            const data = req.data
            if( !data.items || data.items.length === 0 )
            {
                req.reject( 400, 'Order must have at least 1 item' )
            }
            for( const it of data.items )
            {
                if( it.qty <= 0 ) req.reject( 400, 'Quantity must be > 0' )
            }
            data.createdAt = new Date().toISOString()
        } )

        // 2. Action submitOrder
        this.on( 'submitOrder', async req => {
            const {orderID} = req.data
            const tx = cds.transaction( req )

            // 2.1. Load order header
            const orderRow = await tx.run(
                SELECT.one.from( this.entities.Orders ).where( {ID: orderID} )
            )
            if( !orderRow )
            {
                return {success: false, message: `Order ${ orderID } not found`}
            }

            // 2.2. Load items
            const items = await tx.run(
                SELECT.from( this.entities.OrderItems ).where( {parent_ID: orderID} )
            )
            if( !items.length )
            {
                return {success: false, message: `Order ${ orderID } has no items`}
            }

            // 2.3. Compute total
            const total = items.reduce(
                ( sum, it ) => sum + Number( it.qty ) * Number( it.price ),
                0
            )

            await tx.run(
                UPDATE( this.entities.Orders ).set( {total} ).where( {ID: orderID} )
            )

            // 2.4. Build event payload
            const payload = {
                orderId: orderID,
                total: total,
                itemCount: items.length,
                customer: orderRow.customer,
                submittedAt: new Date().toISOString()
            }

            // 2.5. Emit in-process event (analytics in same Node.js process will catch this)
            await cds.emit( 'OrderSubmitted', payload )

            console.log( messaging )

            // 2.6. (Optional) Emit to external messaging broker
            if( messaging )
            {
                console.log( '[order-service] Messaging', payload )
                await messaging.emit( 'OrderSubmitted', payload )
            }

            console.log( '[order-service] Emitted OrderSubmitted for', orderID )

            // 2.7. Return response
            return {
                success: true,
                message: `Order ${ orderID } submitted, total=${ total }`
            }
        } )

        // 3. Action getHighValueOrders
        this.on( 'getHighValueOrders', async req => {
            const {minTotal} = req.data
            const tx = cds.transaction( req )
            const rows = await tx.run(
                SELECT.from( this.entities.Orders ).where`total >= ${ minTotal }`
            )
            return rows
        } )

        // 4. Action checkStock
        this.on( 'checkStock', async req => {
            const {sku} = req.data

            if( !stockBaseURL )
            {
                req.error( 500, 'stockService is not configured' )
            }

            try
            {
                const resp = await fetchStockWithRetry( stockBaseURL, sku )
                return resp.data
            } catch( err )
            {
                req.error( 500, 'Failed to check stock: ' + err.message )
            }
        } )

        // 5. Action getOrderWithStock
        this.on( 'getOrderWithStock', async req => {
            const {orderID} = req.data
            const tx = cds.transaction( req )

            const order = await tx.run(
                SELECT.one.from( this.entities.Orders ).where( {ID: orderID} )
            )
            if( !order )
            {
                req.error( 404, `Order ${ orderID } not found` )
            }
            const items = await tx.run(
                SELECT.from( this.entities.OrderItems ).where( {parent_ID: orderID} )
            )

            const stockReport = []
            for( const it of items )
            {
                try
                {
                    const resp = await fetchStockWithRetry( stockBaseURL, it.sku )
                    stockReport.push(
                        `Item ${ it.sku }: availableQty=${ resp.data.availableQty }`
                    )
                } catch( err )
                {
                    stockReport.push( `Item ${ it.sku }: failed to check stock` )
                }
            }

            return {
                orderID: order.ID,
                customer: order.customer,
                items: JSON.stringify( items ),
                stockReport: stockReport.join( '; ' )
            }
        } )

        // 6. after READ Orders
        this.after( 'READ', 'Orders', rows => {
            const arr = Array.isArray( rows ) ? rows : [ rows ]
            for( const o of arr )
            {
                o.note = 'Thank you for shopping!' // runtime-only field
            }
        } )

        return super.init()
    }
}

module.exports = {OrderService}
