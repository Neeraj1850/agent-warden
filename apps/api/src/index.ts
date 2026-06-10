import { getEnv } from "./config/env.js";
import { createApiServer } from "./server.js";

const env = getEnv();
const server = await createApiServer(env);

server.listen(env.port, () => {
  console.log(
    `[api] AgentWarden API listening on http://localhost:${env.port} x402=${env.x402Enabled ? env.x402Provider : "off"}`
  );
});
