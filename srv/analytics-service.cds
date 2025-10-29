using shop from '../db/schema';

service analytics {

  // Subscribe to the event defined in the order service
  event OrderSubmitted {
    orderId     : UUID;
    total       : Decimal(15, 2);
    itemCount   : Integer;
    customer    : String;
    submittedAt : Timestamp;
  };

  @readonly
  entity OrderEvents as projection on shop.OrderEventLog;
}
