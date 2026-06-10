import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/express";

export interface StandardSellerRoute {
  method: "POST";
  path: string;
  description: string;
}

export function createStandardX402Installer(config: {
  facilitatorUrl: string;
  network: string;
  price: string;
  payTo: string;
  routes: StandardSellerRoute[];
}): (app: unknown) => void {
  const facilitatorClient = new HTTPFacilitatorClient({
    url: config.facilitatorUrl
  });
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    config.network as `${string}:${string}`,
    new ExactEvmScheme()
  );
  const routeConfig = Object.fromEntries(
    config.routes.map((route) => [
      `${route.method} ${route.path}`,
      {
        accepts: [
          {
            scheme: "exact",
            price: config.price,
            network: config.network,
            payTo: config.payTo
          }
        ],
        description: route.description,
        mimeType: "application/json"
      }
    ])
  );

  return (app: unknown) => {
    const install = paymentMiddleware as unknown as (
      target: unknown,
      routes: Record<string, unknown>,
      server: unknown
    ) => void;
    install(app, routeConfig, resourceServer);
  };
}
