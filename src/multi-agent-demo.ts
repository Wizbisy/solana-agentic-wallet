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
 *
 * Funding Strategy: A single "Fleet Commander" agent receives the Devnet airdrop,
 * then distributes SOL to the other agents via TRANSFER intents. This avoids
 * Devnet rate limits (429) from multiple airdrop requests.
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
 * Delay helper — prevents Devnet rate limiting between sequential operations.
 */
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an independent agent mission (post-funding):
 * 1. Report balance
 * 2. Execute role-specific intents
 * 3. Report final state
 */
async function runAgentMission(agent: AIAgent, config: AgentConfig): Promise<void> {
    const separator = '─'.repeat(50);

    console.log(chalk.magenta(`\n${separator}`));
    console.log(chalk.magenta(`  Agent: ${config.name}`));
    console.log(chalk.magenta(`  Role:  ${config.role}`));
    console.log(chalk.magenta(separator));

    const balance = await agent.getBalance();
    logger.agent(config.name, `Balance: ${balance} SOL`);

    if (balance < 0.001) {
        logger.warn(`${config.name}: Insufficient balance for operations. Skipping mission.`);
        return;
    }

    switch (config.name) {
        case 'Alpha-Trader': {
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
            const targetAddress = Keypair.generate().publicKey;
            logger.agent(config.name, `Initiating transfer to ${targetAddress.toBase58().slice(0, 8)}...`);
            await agent.executeIntent('TRANSFER', {
                target: targetAddress,
                amount: 0.001
            });
            break;
        }

        case 'Gamma-Auditor': {
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

    const finalBalance = await agent.getBalance();
    logger.agent(config.name, `Final Balance: ${finalBalance} SOL`);
    logger.success(`${config.name} mission complete.`);
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

    // Phase 1: Initialize all agents (each gets their own isolated keypair)
    logger.info('Phase 1: Initializing agent fleet...');
    const agents: AIAgent[] = AGENT_FLEET.map(config => new AIAgent(config.name));

    // Phase 2: Fund the Fleet Commander (first agent) via single airdrop
    logger.info('Phase 2: Funding Fleet Commander via Devnet airdrop...');
    const commander = agents[0];
    const commanderBalance = await commander.getBalance();

    if (commanderBalance < 0.05) {
        await commander.executeIntent('FUND');
        await delay(3000);
    } else {
        logger.agent(AGENT_FLEET[0].name, `Already funded (${commanderBalance} SOL). Skipping airdrop.`);
    }

    // Phase 3: Commander distributes SOL to the fleet via TRANSFER intents
    logger.info('Phase 3: Fleet Commander distributing SOL to agents...');
    for (let i = 1; i < agents.length; i++) {
        const agentBalance = await agents[i].getBalance();
        if (agentBalance < 0.005) {
            logger.agent(AGENT_FLEET[0].name, `Funding ${AGENT_FLEET[i].name}...`);
            await commander.executeIntent('TRANSFER', {
                target: agents[i].getPublicKey(),
                amount: 0.01
            });
            await delay(2000);
        } else {
            logger.agent(AGENT_FLEET[i].name, `Already funded (${agentBalance} SOL). Skipping.`);
        }
    }

    // Phase 4: Execute independent agent missions
    logger.info('Phase 4: Executing independent agent missions...');
    for (let i = 0; i < agents.length; i++) {
        try {
            await runAgentMission(agents[i], AGENT_FLEET[i]);
        } catch (error: any) {
            logger.error(`${AGENT_FLEET[i].name} mission failed: ${error.message}`);
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

process.on('unhandledRejection', (error) => {
    logger.error(`FATAL Pipeline Error: ${error}`);
    process.exit(1);
});

main().catch((error) => {
    logger.error(`FATAL Execution Error: ${error}`);
    process.exit(1);
});
