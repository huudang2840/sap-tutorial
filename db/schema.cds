namespace shop;

entity Orders {
  key ID       : UUID;
      customer : String(100);
      total    : Decimal(9,2);
      items    : Composition of many OrderItems
                on items.parent = $self;
      createdAt: Timestamp;
}

entity OrderItems {
  key ID     : UUID;
      parent : Association to Orders;
      sku    : String(50);
      name   : localized String(100); // đa ngôn ngữ
      qty    : Integer;
      price  : Decimal(9,2);
}
