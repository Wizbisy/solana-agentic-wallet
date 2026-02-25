import { AgenticWallet } from '../../core/AgenticWallet';
import { SolanaRpcService } from '../../services/RpcService';
import { IntentStrategy, IntentOptions } from '../types';
import { logger } from '../../utils/logger';
import open from 'open';

export class FundIntentHandler implements IntentStrategy {
    constructor(private rpc: SolanaRpcService, private wallet: AgenticWallet) {}

    async execute(options?: IntentOptions): Promise<string | boolean> {
        logger.agent(this.wallet.getName(), 'Intent strategy resolved: FUND. Requesting Airdrop via RPC Service...');
        try {
            const amount = options?.amount || 0; // The RPC or faucet handles the default limit
            const signature = await this.rpc.requestAirdrop(this.wallet.getPublicKey(), amount);
            logger.agent(this.wallet.getName(), `Airdrop successful. Signature: ${signature}`);
            return signature;
        } catch (error: any) {
            logger.error(`Airdrop operation failed: ${error.message}`);
            logger.warn(`=============================================================`);
            logger.warn(`NOTICE: RPC rate-limits exceeded or funding unavailable.`);
            logger.warn(`Opening the official Solana Faucet for manual claiming.`);
            logger.warn(`Destination Address: ${this.wallet.getPublicKey().toBase58()}`);
            logger.warn(`=============================================================`);
            
            try {
                const faucetUrl = `https://faucet.solana.com/?address=${this.wallet.getPublicKey().toBase58()}`;
                logger.info(`Opening browser to: ${faucetUrl}`);
                await open(faucetUrl);
            } catch(e) {
                logger.error(`Invocation failed. Please visit the URL manually.`);
            }

            return false;
        }
    }
}
