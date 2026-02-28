import { PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { AIAgent } from './core/AIAgent';
import { logger } from './utils/logger';
import { ENV } from './config/env';
import chalk from 'chalk';
import { exec } from 'child_process';

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

    logger.info('Initializing Orchestrator Sequence...');
    const agent = new AIAgent(ENV.AGENT_NAME);

    let balance = await agent.getBalance();
    logger.agent(agent.name, `Current Node Balance: ${balance} SOL`);

    if (balance < 0.01) {
        const result = await agent.executeIntent('FUND');

        balance = await agent.getBalance();
        if (balance < 0.01) {
            const address = agent.getPublicKey().toBase58();
            const faucetUrl = `https://faucet.solana.com/?address=${address}`;
            logger.warn('Airdrop failed. Opening browser to Solana Faucet...');
            logger.info(`Faucet URL: ${faucetUrl}`);

            const openCmd = process.platform === 'win32' ? `start ${faucetUrl}`
                          : process.platform === 'darwin' ? `open ${faucetUrl}`
                          : `xdg-open ${faucetUrl}`;
            exec(openCmd);

            console.log(chalk.yellow(`\n  ⏳ Please fund ${agent.name} in the browser, then press Enter to continue...`));
            await new Promise<void>(resolve => {
                process.stdin.once('data', () => resolve());
            });

            balance = await agent.getBalance();
            if (balance < 0.005) {
                logger.error(`${agent.name} still has ${balance.toFixed(4)} SOL. Please fund and re-run.`);
                process.exit(1);
            }
            logger.success(`${agent.name} funded! Balance: ${balance.toFixed(4)} SOL`);
        }
    } else {
        logger.agent(agent.name, `Balance is sufficient (${balance} SOL). Skipping devnet FUND request.`);
    }

    const targetAddress = Keypair.generate().publicKey;
    await agent.executeIntent('TRANSFER', {
        target: targetAddress,
        amount: 0.005
    });

    logger.info(`Orchestrator: Crafting complex outbound DeFi Payload...`);
    
    /** This validates the capacity to execute arbitrary smart contract payloads 
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

process.on('unhandledRejection', (error) => {
    logger.error(`FATAL Pipeline Error: ${error}`);
    process.exit(1);
});

main().catch((error) => {
    logger.error(`FATAL Execution Error: ${error}`);
    process.exit(1);
});
