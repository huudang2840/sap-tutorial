using shop from '../db/schema';

service OrderService {
  entity Orders     as projection on shop.Orders;
  entity OrderItems as projection on shop.OrderItems;

  action submitOrder(orderID : UUID)
    returns { success : Boolean; message : String; };

  action getHighValueOrders(minTotal : Decimal(9,2))
    returns many Orders;

  action checkStock(sku : String)
    returns { sku : String; availableQty : Integer; };
}
