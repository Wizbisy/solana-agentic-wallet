import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { ENV } from '../config/env';
import { NetworkError } from '../utils/errors';
import { logger } from '../utils/logger';

export class SolanaRpcService {
    private connection: Connection;

    constructor() {
        this.connection = new Connection(ENV.SOLANA_RPC_URL, 'confirmed');
        logger.info(`RPC Service initialized to ${ENV.SOLANA_RPC_URL}`);
    }

    async getBalance(address: PublicKey): Promise<number> {
        try {
            const lamports = await this.connection.getBalance(address);
            return lamports / 1e9;
        } catch (error: any) {
            throw new NetworkError(`RPC Balance fetch failed: ${error.message}`);
        }
    }

    async requestAirdrop(address: PublicKey, amountSol: number): Promise<string> {
        try {
            const signature = await this.connection.requestAirdrop(address, amountSol * 1e9);
            await this.confirmTransaction(signature);
            return signature;
        } catch (error: any) {
            throw new NetworkError(`RPC Airdrop failed: ${error.message}`);
        }
    }

    async sendTransaction(transaction: Transaction | VersionedTransaction): Promise<string> {
        try {
            const signature = await this.connection.sendRawTransaction(transaction.serialize());
            await this.confirmTransaction(signature);
            return signature;
        } catch (error: any) {
            throw new NetworkError(`RPC Send Raw Tx failed: ${error.message}`);
        }
    }

    async simulateTransaction(transaction: Transaction | VersionedTransaction): Promise<boolean> {
        try {
            let result;
            if ('message' in transaction) {
                 result = await this.connection.simulateTransaction(transaction);
            } else {
                 result = await this.connection.simulateTransaction(transaction);
            }

            if (result.value.err) {
                logger.error(`RPC Pre flight Validation Failed: ${JSON.stringify(result.value.err)}`);
                return false;
            }
            return true;
        } catch (error: any) {
            throw new NetworkError(`RPC Pre flight request failed: ${error.message}`);
        }
    }

    async attachRecentBlockhash(transaction: Transaction | VersionedTransaction, feePayer: PublicKey): Promise<void> {
        const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
        
        if ('message' in transaction) {
            transaction.message.recentBlockhash = blockhash;
        } else {
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = feePayer;
        }
    }

    private async confirmTransaction(signature: string): Promise<void> {
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
        await this.connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight
        });
    }
}
