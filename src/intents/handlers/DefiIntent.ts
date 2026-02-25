import { AgenticWallet } from '../../core/AgenticWallet';
import { IntentStrategy, IntentOptions } from '../types';
import { logger } from '../../utils/logger';
import { AgentError } from '../../utils/errors';

export class DefiExecutionHandler implements IntentStrategy {
    constructor(private wallet: AgenticWallet) {}

    async execute(options?: IntentOptions): Promise<string> {
        if (!options?.transaction) {
            throw new AgentError('Missing raw transaction payload for DEFI_EXECUTION intent.', 'MISSING_PAYLOAD');
        }

        logger.agent(this.wallet.getName(), 'Passing complex DeFi smart contract payload to the Secure Wallet for signing...');
        const signature = await this.wallet.signAndSendTransaction(options.transaction);
        
        if (signature) {
            logger.agent(this.wallet.getName(), `DeFi Payload Executed Successfully. Signature: ${signature}`);
            return signature;
        } else {
            throw new AgentError('DeFi Payload Execution Failed.', 'DEFI_EXECUTION_FAILED');
        }
    }
}
