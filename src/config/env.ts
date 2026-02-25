import * as dotenv from 'dotenv';
dotenv.config();

export const ENV = {
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    ENVIRONMENT: process.env.NODE_ENV || 'development',
    WALLET_STORAGE_PATH: process.env.WALLET_STORAGE_PATH || '.agent_wallets',
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3', 10),
    AGENT_NAME: process.env.AGENT_NAME || 'Nexus-Prime',
};

// Validate critical variables
if (!ENV.SOLANA_RPC_URL.startsWith('http')) {
    throw new Error('FATAL: Invalid SOLANA_RPC_URL in configuration.');
}
