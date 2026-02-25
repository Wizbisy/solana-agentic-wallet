import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';

export interface WalletConfig {
    name: string;
    networkUrl?: string; // Overrides ENV dynamically if provided
}

export interface IntentOptions {
    target?: PublicKey;
    amount?: number;
    transaction?: Transaction | VersionedTransaction;
    customParams?: Record<string, any>;
}

export type IntentType = 'FUND' | 'TRANSFER' | 'DEFI_EXECUTION';

export interface IntentStrategy {
    execute(options?: IntentOptions): Promise<string | boolean>;
}
