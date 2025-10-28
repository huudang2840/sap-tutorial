const cds = require( '@sap/cds' )
const {Orders, OrderItems} = cds.entities
const axios = require( 'axios' )

class OrderService extends cds.ApplicationService {
    init () {

        // 1. Validation trước khi CREATE Order
        this.before( 'CREATE', 'Orders', req => {
            const data = req.data
            if( !data.items || data.items.length === 0 )
            {
                req.reject( 400, 'Order phải có ít nhất 1 dòng hàng' )
            }
            for( const it of data.items )
            {
                if( it.qty <= 0 ) req.reject( 400, 'Số lượng phải > 0' )
            }
            data.createdAt = new Date().toISOString()
        } )

        // 2. Action submitOrder: tính total từ OrderItems
        this.on( 'submitOrder', async req => {
            const {orderID} = req.data
            const tx = cds.transaction( req )

            const items = await tx.run(
                SELECT.from( OrderItems ).where( {parent_ID: orderID} )
            )

            if( !items.length )
            {
                return {success: false, message: 'Không tìm thấy item cho order'}
            }

            const total = items.reduce(
                ( sum, it ) => sum + Number( it.qty ) * Number( it.price ),
                0
            )

            await tx.run(
                UPDATE( Orders ).set( {total} ).where( {ID: orderID} )
            )

            // Emit sự kiện nội bộ (event-driven)
            await this.emit( 'OrderSubmitted', {
                orderId: orderID,
                total
            } )

            return {success: true, message: `Order ${ orderID } total=${ total }`}
        } )

        // 3. Action getHighValueOrders: query DB với CAP SELECT
        this.on( 'getHighValueOrders', async req => {
            const {minTotal} = req.data
            const tx = cds.transaction( req )
            const rows = await tx.run(
                SELECT.from( Orders ).where`total >= ${ minTotal }`
            )
            return rows
        } )

        // 4. Action checkStock: gọi external service (mock)
        this.on( 'checkStock', async req => {
            const {sku} = req.data
            const resp = await axios.post( 'http://localhost:5000/stock', {sku} )
            return resp.data
        } )

        // 5. after READ: enrich response
        this.after( 'READ', 'Orders', rows => {
            const arr = Array.isArray( rows ) ? rows : [ rows ]
            for( const o of arr )
            {
                o.note = 'Thank you for shopping!' // field ảo runtime
            }
        } )

        // 6. Lắng nghe event nội bộ (event-driven)
        this.on( 'OrderSubmitted', evt => {
            console.log( '>>> EVENT OrderSubmitted:', evt.data )
            // tại đây có thể gửi email, update dashboard, ...
        } )

        return super.init()
    }
}

module.exports = {OrderService}
