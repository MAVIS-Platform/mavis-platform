// Public, deterministic teaching example. Values are illustrative and never sent to the Runner.
export const sampleScenario = {
  id: "checkout-request-v1",
  request: "POST /orders/checkout",
  services: {
    Gateway: {
      x: 14,
      y: 49,
      file: "GatewayRoutes.java",
      code: 'route("/orders/**", "orders");',
      span: "HTTP POST /orders/checkout",
      start: 0,
      duration: 184,
    },
    Orders: {
      x: 48,
      y: 49,
      file: "OrderService.java",
      code: "inventory.reserve(order.items());\npayments.authorize(order.id());",
      span: "OrderService.checkout",
      start: 18,
      duration: 148,
    },
    Payments: {
      x: 83,
      y: 26,
      file: "PaymentClient.java",
      code: '@PostMapping("/payments/authorize")\nvoid authorize(@RequestBody OrderId id);',
      span: "HTTP POST /payments/authorize",
      start: 79,
      duration: 66,
    },
    Inventory: {
      x: 83,
      y: 76,
      file: "InventoryClient.java",
      code: '@PostMapping("/inventory/reservations")\nvoid reserve(@RequestBody List<Item> items);',
      span: "HTTP POST /inventory/reservations",
      start: 39,
      duration: 24,
    },
  },
  edges: [
    { from: "Gateway", to: "Orders", path: "M 84 98 H 288 M 178 92 l 8 6 -8 6" },
    { from: "Orders", to: "Payments", path: "M 288 98 C 391 98 393 52 498 52 M 392 70 l 9 2 -5 7" },
    {
      from: "Orders",
      to: "Inventory",
      path: "M 288 98 C 391 98 393 152 498 152 M 396 121 l 4 8 -9 1",
    },
  ],
} as const;

export type ServiceName = keyof typeof sampleScenario.services;
