import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface AuditRecord {
    agentId: string;
    intentType: string;
    status: 'SUCCESS' | 'FAILED' | 'REJECTED';
    signature?: string;
    timestamp: string;
    details: any;
}

/**
  Local NoSQL Document Database for Auditing Agent Intent execution logs.
  Persists JSON records immediately to disk for compliance and debugging.
 **/
export class AuditLogger {
    private static dbPath = path.resolve(process.cwd(), '.agent_wallets/audit_log.json');

    static async logExecution(record: Omit<AuditRecord, 'timestamp'>) {
        try {
            const data: AuditRecord = {
                ...record,
                timestamp: new Date().toISOString()
            };

            const existing = this.readDb();
            existing.push(data);

            const safePath = path.dirname(this.dbPath);
            if (!fs.existsSync(safePath)) {
                fs.mkdirSync(safePath, { recursive: true });
            }

            fs.writeFileSync(this.dbPath, JSON.stringify(existing, null, 2));
            logger.info(`Database: Recorded audit log for agent ${record.agentId}`);
        } catch (e: any) {
            logger.error(`Database: Failed to write audit log. Reason: ${e.message}`);
        }
    }

    private static readDb(): AuditRecord[] {
        if (!fs.existsSync(this.dbPath)) {
            return [];
        }
        try {
            const content = fs.readFileSync(this.dbPath, 'utf-8');
            return JSON.parse(content);
        } catch (e) {
            logger.error('Database: Corrupted audit log found. Starting fresh.');
            return [];
        }
    }
}
