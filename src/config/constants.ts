import { PublicKey } from '@solana/web3.js';

export const CONSTANTS = {
    // Standard system constants
    SYSTEM_PROGRAM_ID: new PublicKey('11111111111111111111111111111111'),
    TOKEN_PROGRAM_ID: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    
    // Safety thresholds
    CRITICAL_BALANCE_THRESHOLD_SOL: 0.05,
    DEFAULT_FUNDING_AMOUNT_SOL: 1,
    
    // Network retry parameters
    RETRY_DELAY_MS: 3000,
    MAX_TIMEOUT_MS: 15000
};
