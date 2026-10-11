import type { CreateSuspensionInput, ReceivableAccountQuery, ReconnectionAssignment, ServiceControlPolicy } from '@bcis/shared';
import { ServiceControlRepository } from './repository.js';
import type { Database } from '../db/client.js';

export class ServiceControlService {
  private readonly repository: ServiceControlRepository;
  constructor(database: Database) { this.repository = new ServiceControlRepository(database); }

  async receivableAccounts(query: ReceivableAccountQuery) {
    return this.repository.receivableAccounts(query, await this.repository.policy());
  }
  async receivableAccountExport(query: Omit<ReceivableAccountQuery, 'page' | 'pageSize'>) {
    return this.repository.receivableAccounts({ ...query, page: 1, pageSize: 10_001 }, await this.repository.policy());
  }
  policy() { return this.repository.policy(); }
  savePolicy(policy: ServiceControlPolicy, actorId: string, requestId: string) { return this.repository.savePolicy(policy, actorId, requestId); }
  createSuspension(input: CreateSuspensionInput, actorId: string, requestId: string) { return this.repository.createSuspension(input, actorId, requestId); }
  approveSuspension(id: string, actorId: string, requestId: string) { return this.repository.approveSuspension(id, actorId, requestId); }
  suspensions(page: number, pageSize: number) { return this.repository.suspensions(page, pageSize); }
  technicians() { return this.repository.technicians(); }
  reconnections(actorId: string, page: number, pageSize: number) { return this.repository.reconnections(actorId, false, page, pageSize); }
  allReconnections(page: number, pageSize: number) { return this.repository.reconnections('', true, page, pageSize); }
  assignReconnection(id: string, input: ReconnectionAssignment, actorId: string, requestId: string) { return this.repository.assignReconnection(id, input, actorId, requestId); }
  completeReconnection(id: string, actorId: string, requestId: string) { return this.repository.completeReconnection(id, actorId, requestId); }
}
