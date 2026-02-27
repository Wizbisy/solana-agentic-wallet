import { PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { AIAgent } from './core/AIAgent';
import { AgentBrain } from './agent/AgentBrain';
import { logger } from './utils/logger';
import { ENV } from './config/env';
import chalk from 'chalk';
import { exec } from 'child_process';

/**
  Multi-Agent Autonomous Demonstration

  Deploys three independent AI agents on Solana Devnet.
  Uses a "Commander" funding model — the funded agent distributes
  SOL to peers via TRANSFER, avoiding Devnet airdrop rate limits.

  Each agent then runs an autonomous AgentBrain decision loop:
    Perceive on-chain state → Evaluate rules → Execute action

  Prerequisites: Fund at least one agent address via https://faucet.solana.com
**/

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const FUND_AMOUNT = 0.05;

interface AgentConfig {
    name: string;
    role: string;
}

const AGENT_FLEET: AgentConfig[] = [
    { name: 'Alpha-Trader',   role: 'DeFi Execution Agent' },
    { name: 'Beta-Sentinel',  role: 'Transfer & Distribution Agent' },
    { name: 'Gamma-Auditor',  role: 'On-Chain Attestation Agent' },
];

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
  Commander Funding — the agent with the highest balance
  distributes SOL to all unfunded peers via TRANSFER intent.
**/
async function fundFleetFromCommander(agents: AIAgent[]): Promise<void> {
    const balances = await Promise.all(agents.map(a => a.getBalance()));

    let commanderIdx = 0;
    let maxBalance = 0;
    for (let i = 0; i < balances.length; i++) {
        if (balances[i] > maxBalance) {
            maxBalance = balances[i];
            commanderIdx = i;
        }
    }

    const commander = agents[commanderIdx];
    const commanderName = AGENT_FLEET[commanderIdx].name;

    if (maxBalance < 0.01) {
        // No agents funded — try airdrop, then browser fallback
        const firstAgent = agents[0];
        const address = firstAgent.getPublicKey().toBase58();
        logger.info(`No funded agents detected. Attempting airdrop for ${AGENT_FLEET[0].name}...`);

        try {
            await firstAgent.executeIntent('FUND', { amount: 1 });
            const newBal = await firstAgent.getBalance();
            if (newBal >= 0.01) {
                logger.success(`Airdrop succeeded! ${AGENT_FLEET[0].name} now has ${newBal.toFixed(4)} SOL.`);
                commanderIdx = 0;
                maxBalance = newBal;
            } else {
                throw new Error('Airdrop returned insufficient balance');
            }
        } catch {
            const faucetUrl = `https://faucet.solana.com/?address=${address}`;
            logger.warn(`Airdrop failed. Opening browser to Solana Faucet...`);
            logger.info(`Faucet URL: ${faucetUrl}`);

            // Open browser cross-platform
            const openCmd = process.platform === 'win32' ? `start ${faucetUrl}`
                          : process.platform === 'darwin' ? `open ${faucetUrl}`
                          : `xdg-open ${faucetUrl}`;
            exec(openCmd);

            console.log(chalk.yellow(`\n  ⏳ Please fund ${AGENT_FLEET[0].name} in the browser, then press Enter to continue...`));
            await new Promise<void>(resolve => {
                process.stdin.once('data', () => resolve());
            });

            const recheckBal = await firstAgent.getBalance();
            if (recheckBal < 0.01) {
                logger.error(`${AGENT_FLEET[0].name} still has ${recheckBal.toFixed(4)} SOL. Please fund and re-run.`);
                process.exit(1);
            }
            commanderIdx = 0;
            maxBalance = recheckBal;
            logger.success(`${AGENT_FLEET[0].name} funded! Balance: ${recheckBal.toFixed(4)} SOL`);
        }
    }

    logger.info(`Commander: ${commanderName} (${maxBalance.toFixed(4)} SOL)`);

    for (let i = 0; i < agents.length; i++) {
        if (i === commanderIdx) continue;
        if (balances[i] >= 0.01) {
            logger.agent(commanderName, `${AGENT_FLEET[i].name} already funded (${balances[i].toFixed(4)} SOL). Skipping.`);
            continue;
        }

        logger.agent(commanderName, `Funding ${AGENT_FLEET[i].name} with ${FUND_AMOUNT} SOL...`);
        try {
            await commander.executeIntent('TRANSFER', {
                target: agents[i].getPublicKey(),
                amount: FUND_AMOUNT,
            });
            logger.success(`${AGENT_FLEET[i].name} funded successfully.`);
        } catch (error: any) {
            logger.error(`Failed to fund ${AGENT_FLEET[i].name}: ${error.message}`);
        }
        await delay(2000);
    }
}

/**
  Runs an agent through its autonomous AgentBrain decision loop.
**/
async function runAgentWithBrain(agent: AIAgent, config: AgentConfig): Promise<void> {
    const { name } = config;

    console.log(chalk.bold.white(`\n--- ${name} (${config.role}) ---`));
    logger.agent(name, `Wallet: ${agent.getPublicKey().toBase58()}`);

    const brain = new AgentBrain(agent);

    switch (name) {
        case 'Alpha-Trader':
            brain.addRule({
                label: 'DEFI_ROUTE_VALIDATION',
                priority: 5,
                condition: (s) => s.solBalance >= 0.005,
                action: 'DEFI_EXECUTION',
                buildOptions: () => ({
                    transaction: new Transaction().add({
                        keys: [{ pubkey: agent.getPublicKey(), isSigner: true, isWritable: true }],
                        programId: MEMO_PROGRAM_ID,
                        data: Buffer.from(`DEFI_ROUTE:SOL_USDC:VALIDATED:${Date.now()}`, 'utf-8'),
                    }),
                }),
            });
            break;

        case 'Beta-Sentinel':
            brain.addRule({
                label: 'DISTRIBUTE_SOL',
                priority: 3,
                condition: (s) => s.solBalance > 0.04,
                action: 'TRANSFER',
                buildOptions: () => ({
                    target: Keypair.generate().publicKey,
                    amount: 0.002,
                }),
            });
            break;

        case 'Gamma-Auditor':
            brain.addRule({
                label: 'WRITE_ATTESTATION',
                priority: 5,
                condition: (s) => s.solBalance >= 0.005,
                action: 'DEFI_EXECUTION',
                buildOptions: () => ({
                    transaction: new Transaction().add({
                        keys: [{ pubkey: agent.getPublicKey(), isSigner: true, isWritable: true }],
                        programId: MEMO_PROGRAM_ID,
                        data: Buffer.from(`AUDIT:FLEET_OK:${AGENT_FLEET.length}_AGENTS:${new Date().toISOString()}`, 'utf-8'),
                    }),
                }),
            });
            break;
    }

    for (let cycle = 0; cycle < 2; cycle++) {
        const plan = await brain.runCycle();
        if (!plan) {
            logger.agent(name, 'No actionable rules. Idling.');
            break;
        }
        await delay(1500);
    }

    const finalState = brain.getState();
    logger.agent(name, `Final balance: ${finalState.solBalance.toFixed(4)} SOL | Cycles: ${finalState.cyclesCompleted} | Last action: ${finalState.lastAction}`);
    logger.success(`${name} — autonomous loop complete.`);
}

async function main() {
    console.log(chalk.cyan(`
=========================================================
  SOLANA AI AGENT WALLET — Autonomous Fleet (Devnet)
=========================================================
  Environment : ${ENV.ENVIRONMENT}
  RPC Endpoint: ${ENV.SOLANA_RPC_URL}
  Agent Count : ${AGENT_FLEET.length}
  Vault Path  : ${ENV.WALLET_STORAGE_PATH}
=========================================================
`));

    logger.info('Initializing agent fleet and loading wallets...');
    const agents: AIAgent[] = AGENT_FLEET.map(config => new AIAgent(config.name));

    console.log(chalk.yellow('\n  Agent Addresses (fund via https://faucet.solana.com):'));
    for (let i = 0; i < agents.length; i++) {
        const balance = await agents[i].getBalance();
        const status = balance > 0 ? chalk.green(`${balance.toFixed(4)} SOL`) : chalk.red('0 SOL — NEEDS FUNDING');
        console.log(chalk.yellow(`    ${AGENT_FLEET[i].name}: ${agents[i].getPublicKey().toBase58()} [${status}${chalk.yellow(']')}`));
    }
    console.log('');

    // Commander funding: funded agent distributes SOL to peers
    logger.info('Running Commander funding protocol...');
    await fundFleetFromCommander(agents);
    await delay(3000);

    // Run each agent's autonomous brain loop
    for (let i = 0; i < agents.length; i++) {
        try {
            await runAgentWithBrain(agents[i], AGENT_FLEET[i]);
        } catch (error: any) {
            logger.error(`${AGENT_FLEET[i].name}: ${error.message}`);
        }

        if (i < agents.length - 1) {
            logger.info('Cooldown: 5s before next agent...');
            await delay(5000);
        }
    }

    console.log(chalk.green(`
=========================================================
  FLEET EXECUTION COMPLETE
=========================================================
  ${AGENT_FLEET.length} agents deployed with autonomous AgentBrain.
  Commander funding model: one agent funded the fleet.
  Each agent independently:
    - Perceived on-chain state
    - Evaluated rules (FUND_IF_LOW, DEFI, ATTEST, DISTRIBUTE)
    - Executed the highest-priority matching action
    - Logged results to audit trail

  Audit trail: ${ENV.WALLET_STORAGE_PATH}/audit_log.json
=========================================================
`));
}

process.on('unhandledRejection', (error) => {
    logger.error(`FATAL: ${error}`);
    process.exit(1);
});

main().catch((error) => {
    logger.error(`FATAL: ${error}`);
    process.exit(1);
});
