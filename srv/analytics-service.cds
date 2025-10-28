using shop from '../db/schema';

service analytics {
  @readonly
  entity OrderEvents as projection on shop.OrderEventLog;
}