import { AgenticWallet } from '../core/AgenticWallet';
import { SolanaRpcService } from '../services/RpcService';
import { IntentStrategy, IntentOptions, IntentType } from './types';
import { FundIntentHandler } from './handlers/FundIntent';
import { TransferIntentHandler } from './handlers/TransferIntent';
import { DefiExecutionHandler } from './handlers/DefiIntent';
import { AuditLogger } from '../db/AuditLogger';
import { logger } from '../utils/logger';
import { ConfigurationError } from '../utils/errors';

/**
  Orchestrates explicit agent intents and routes them to the correct strategic handler.
 **/
export class IntentOrchestrator {
    private handlers: Map<IntentType, IntentStrategy> = new Map();

    constructor(private wallet: AgenticWallet, private rpc: SolanaRpcService) {
        this.registerHandlers();
    }

    private registerHandlers() {
        this.handlers.set('FUND', new FundIntentHandler(this.rpc, this.wallet));
        this.handlers.set('TRANSFER', new TransferIntentHandler(this.wallet));
        this.handlers.set('DEFI_EXECUTION', new DefiExecutionHandler(this.wallet));
    }

    private sanitizeOptions(options?: IntentOptions): any {
        if (!options) return undefined;
        let instructionsCount = undefined;
        
        if (options.transaction) {
            if ('message' in options.transaction) {
                instructionsCount = options.transaction.message.compiledInstructions.length;
            } else {
                instructionsCount = options.transaction.instructions.length;
            }
        }

        return {
            target: options.target ? options.target.toBase58() : undefined,
            amount: options.amount,
            hasTransaction: !!options.transaction,
            instructionsCount
        };
    }

    public async executeIntent(type: IntentType, options?: IntentOptions) {
        const handler = this.handlers.get(type);
        
        if (!handler) {
            throw new ConfigurationError(`Unknown intent type: ${type}`);
        }

        try {
            const result = await handler.execute(options);
            
            await AuditLogger.logExecution({
                agentId: this.wallet.getName(),
                intentType: type,
                status: result ? 'SUCCESS' : 'FAILED',
                signature: typeof result === 'string' ? result : undefined,
                details: this.sanitizeOptions(options)
            });

            return result;
        } catch (error: any) {
            await AuditLogger.logExecution({
                agentId: this.wallet.getName(),
                intentType: type,
                status: 'REJECTED',
                details: { 
                    error: error.message,
                    originalOptions: this.sanitizeOptions(options) 
                }
            });
            logger.error(`Intent Execution Error (${type}): ${error.message}`);
            return false;
        }
    }
}
