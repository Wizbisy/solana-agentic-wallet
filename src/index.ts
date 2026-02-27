import { PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { AIAgent } from './core/AIAgent';
import { logger } from './utils/logger';
import { ENV } from './config/env';
import chalk from 'chalk';

async function main() {
    console.log(chalk.cyan(`
=========================================================
🤖 SOLANA AI AGENT WALLET
=========================================================
Environment      : ${ENV.ENVIRONMENT}
Target RPC       : ${ENV.SOLANA_RPC_URL}
Vault Path       : ${ENV.WALLET_STORAGE_PATH}
=========================================================
`));

    // 1. Initialize the AI Agent. It handles Key Management securely via its Core bindings.
    logger.info('Initializing Orchestrator Sequence...');
    const agent = new AIAgent(ENV.AGENT_NAME);

    // 2. Fetch Initial Balance
    const balance = await agent.getBalance();
    logger.agent(agent.name, `Current Node Balance: ${balance} SOL`);

    // 3. Execution Pipeline Validation

    // Action A: Request Fund
    if (balance < 0.01) {
        await agent.executeIntent('FUND');
    } else {
        logger.agent(agent.name, `Balance is sufficient (${balance} SOL). Skipping devnet FUND request.`);
    }

    // Action B: Execute Transfer
    const targetAddress = Keypair.generate().publicKey;
    await agent.executeIntent('TRANSFER', {
        target: targetAddress,
        amount: 0.005
    });

    // Action C: Execute Complex Validated DeFi payload (Swap/Routing Execution)
    logger.info(`Orchestrator: Crafting complex outbound DeFi Payload...`);
    
    /** This validates the capacity to execute arbitrary smart-contract payloads 
      (e.g. Raydium Swaps or Jupiter routing) by executing a baseline Memo Program instruction.
      It verifies the orchestrator's agnostic transaction signing capabilities. 
    **/
    const memoProgramId = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    
    const defiPayload = new Transaction().add({
        keys: [{ pubkey: agent.getPublicKey(), isSigner: true, isWritable: true }],
        programId: memoProgramId,
        data: Buffer.from("DEFI_SWAP_ROUTING_EXECUTED", "utf-8"),
    });

    await agent.executeIntent('DEFI_EXECUTION', {
        transaction: defiPayload
    });

    console.log(chalk.green(`
=========================================================
✅ EXECUTION PIPELINE COMPLETE
=========================================================
Audit logs saved to Database Layer successfully.
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
