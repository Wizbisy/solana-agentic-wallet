import { AgenticWallet } from '../../core/AgenticWallet';
import { SolanaRpcService } from '../../services/RpcService';
import { IntentStrategy, IntentOptions } from '../types';
import { logger } from '../../utils/logger';

export class FundIntentHandler implements IntentStrategy {
    constructor(private rpc: SolanaRpcService, private wallet: AgenticWallet) {}

    async execute(options?: IntentOptions): Promise<string | boolean> {
        logger.agent(this.wallet.getName(), 'Intent strategy resolved: FUND. Requesting Airdrop via RPC Service...');
        try {
            const amount = options?.amount || 0;
            const signature = await this.rpc.requestAirdrop(this.wallet.getPublicKey(), amount);
            logger.agent(this.wallet.getName(), `Airdrop successful. Signature: ${signature}`);
            return signature;
        } catch (error: any) {
            const address = this.wallet.getPublicKey().toBase58();
            logger.warn(`Airdrop failed for ${address}: ${error.message}`);
            logger.warn(`Fund manually: https://faucet.solana.com/?address=${address}`);
            return false;
        }
    }
}
