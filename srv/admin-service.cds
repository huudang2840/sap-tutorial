using shop from '../db/schema';

@requires: 'Admin'
service AdminService {
  @readonly
  entity OrdersAudit as projection on shop.Orders;
}
