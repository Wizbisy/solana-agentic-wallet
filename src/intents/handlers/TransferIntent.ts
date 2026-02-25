import { SystemProgram, Transaction, PublicKey } from '@solana/web3.js';
import { AgenticWallet } from '../../core/AgenticWallet';
import { IntentStrategy, IntentOptions } from '../types';
import { logger } from '../../utils/logger';
import { AgentError } from '../../utils/errors';

export class TransferIntentHandler implements IntentStrategy {
    constructor(private wallet: AgenticWallet) {}

    async execute(options?: IntentOptions): Promise<string> {
        if (!options?.target || !options?.amount) {
            throw new AgentError('Missing target or amount for TRANSFER intent.', 'INVALID_OPTIONS');
        }

        logger.agent(this.wallet.getName(), `Building transfer transaction for ${options.amount} SOL to ${options.target.toBase58()}...`);

        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: this.wallet.getPublicKey(),
                toPubkey: options.target,
                lamports: options.amount * 1e9,
            })
        );

        return await this.wallet.signAndSendTransaction(transaction);
    }
}
