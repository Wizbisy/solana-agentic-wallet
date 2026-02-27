import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

export interface WalletConfig {
    name: string;
    networkUrl?: string;
}

export interface IntentOptions {
    target?: PublicKey;
    amount?: number;
    transaction?: Transaction | VersionedTransaction;
    mint?: PublicKey;
    customParams?: Record<string, any>;
}

export type IntentType = 'FUND' | 'TRANSFER' | 'DEFI_EXECUTION' | 'TOKEN_TRANSFER';

export interface IntentStrategy {
    execute(options?: IntentOptions): Promise<string | boolean>;
}
