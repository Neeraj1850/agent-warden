import type { ReputationProvider, ReputationSignal } from "./reputation.interface.js";

export class LocalReputationProvider implements ReputationProvider {
  async getSignals(_subject: string): Promise<ReputationSignal[]> {
    return [];
  }
}
