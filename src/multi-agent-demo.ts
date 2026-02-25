import { PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { AIAgent } from './core/AIAgent';
import { logger } from './utils/logger';
import { ENV } from './config/env';
import chalk from 'chalk';

/**
 * Multi-Agent Demonstration
 *
 * Spins up three independent AI agents, each with their own isolated keypair
 * and wallet instance. Demonstrates concurrent autonomous execution where
 * each agent manages its own balance, transfers, and DeFi operations
 * without interfering with the others.
 */

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

interface AgentConfig {
    name: string;
    role: string;
}

const AGENT_FLEET: AgentConfig[] = [
    { name: 'Alpha-Trader',   role: 'Autonomous DeFi Execution Agent' },
    { name: 'Beta-Sentinel',  role: 'Balance Monitoring & Transfer Agent' },
    { name: 'Gamma-Auditor',  role: 'On-Chain Attestation Agent' },
];

/**
 * Execute an independent agent lifecycle:
 * 1. Initialize with isolated keypair
 * 2. Fund via Devnet airdrop
 * 3. Execute role-specific intents
 * 4. Report final state
 */
async function runAgentLifecycle(config: AgentConfig): Promise<void> {
    const separator = '─'.repeat(50);

    console.log(chalk.magenta(`\n${separator}`));
    console.log(chalk.magenta(`  Agent: ${config.name}`));
    console.log(chalk.magenta(`  Role:  ${config.role}`));
    console.log(chalk.magenta(separator));

    // Phase 1: Initialize — each agent gets its own KeyManager-derived keypair
    const agent = new AIAgent(config.name);
    logger.agent(config.name, `Public Key: ${agent.getPublicKey().toBase58()}`);

    // Phase 2: Fund — request Devnet airdrop if balance is insufficient
    const balance = await agent.getBalance();
    logger.agent(config.name, `Initial Balance: ${balance} SOL`);

    if (balance < 0.01) {
        await agent.executeIntent('FUND');
        const postFundBalance = await agent.getBalance();
        logger.agent(config.name, `Post-Fund Balance: ${postFundBalance} SOL`);
    }

    // Phase 3: Execute role-specific intents
    switch (config.name) {
        case 'Alpha-Trader': {
            // Simulate DeFi execution capability via Memo Program
            logger.agent(config.name, 'Executing DeFi payload validation...');
            const defiPayload = new Transaction().add({
                keys: [{ pubkey: agent.getPublicKey(), isSigner: true, isWritable: true }],
                programId: MEMO_PROGRAM_ID,
                data: Buffer.from(`ALPHA:SWAP_ROUTE_VALIDATED:${Date.now()}`, 'utf-8'),
            });
            await agent.executeIntent('DEFI_EXECUTION', { transaction: defiPayload });
            break;
        }

        case 'Beta-Sentinel': {
            // Execute a SOL transfer to a generated address
            const targetAddress = Keypair.generate().publicKey;
            logger.agent(config.name, `Initiating transfer to ${targetAddress.toBase58().slice(0, 8)}...`);
            await agent.executeIntent('TRANSFER', {
                target: targetAddress,
                amount: 0.003
            });
            break;
        }

        case 'Gamma-Auditor': {
            // Write an on-chain attestation via Memo Program
            logger.agent(config.name, 'Writing on-chain audit attestation...');
            const attestation = new Transaction().add({
                keys: [{ pubkey: agent.getPublicKey(), isSigner: true, isWritable: true }],
                programId: MEMO_PROGRAM_ID,
                data: Buffer.from(`AUDIT:FLEET_INTEGRITY_VERIFIED:${new Date().toISOString()}`, 'utf-8'),
            });
            await agent.executeIntent('DEFI_EXECUTION', { transaction: attestation });
            break;
        }
    }

    // Phase 4: Report final balance
    const finalBalance = await agent.getBalance();
    logger.agent(config.name, `Final Balance: ${finalBalance} SOL`);
    logger.success(`${config.name} lifecycle complete.`);
}

/**
 * Delay helper — prevents Devnet rate limiting between sequential agent airdrops.
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log(chalk.cyan(`
═════════════════════════════════════════════════════════
 🤖 SOLANA AI AGENT WALLET — MULTI-AGENT DEMONSTRATION
═════════════════════════════════════════════════════════
 Environment : ${ENV.ENVIRONMENT}
 RPC Endpoint: ${ENV.SOLANA_RPC_URL}
 Agent Count : ${AGENT_FLEET.length}
 Vault Path  : ${ENV.WALLET_STORAGE_PATH}
═════════════════════════════════════════════════════════
`));

    // Execute each agent sequentially with cooldown to avoid Devnet rate limits
    for (let i = 0; i < AGENT_FLEET.length; i++) {
        try {
            await runAgentLifecycle(AGENT_FLEET[i]);
        } catch (error: any) {
            logger.error(`${AGENT_FLEET[i].name} encountered an error: ${error.message}`);
        }

        // Cooldown between agents to avoid Devnet airdrop rate limits (429)
        if (i < AGENT_FLEET.length - 1) {
            logger.info(`Cooldown: Waiting 15s before next agent to avoid Devnet rate limits...`);
            await delay(15000);
        }
    }

    console.log(chalk.green(`
═════════════════════════════════════════════════════════
 ✅ MULTI-AGENT FLEET EXECUTION COMPLETE
═════════════════════════════════════════════════════════
 All ${AGENT_FLEET.length} agents executed independently.
 Each agent maintained its own:
   • Isolated Keypair (via KeyManager)
   • Independent Balance
   • Separate Audit Trail
 
 Audit logs → ${ENV.WALLET_STORAGE_PATH}/audit_log.json
═════════════════════════════════════════════════════════
`));
}

// Global Rejection Handler
process.on('unhandledRejection', (error) => {
    logger.error(`FATAL Pipeline Error: ${error}`);
    process.exit(1);
});

main().catch((error) => {
    logger.error(`FATAL Execution Error: ${error}`);
    process.exit(1);
});
