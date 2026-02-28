import { AIAgent } from '../core/AIAgent';
import { AgentState, createInitialState } from './AgentState';
import { IntentType, IntentOptions } from '../intents/types';
import { logger } from '../utils/logger';
import { PublicKey, Transaction } from '@solana/web3.js';


interface AgentRule {
    label: string;
    priority: number;
    condition: (state: AgentState) => boolean;
    action: IntentType;
    buildOptions: (state: AgentState) => IntentOptions | undefined;
}

export interface ActionPlan {
    ruleFired: string;
    action: IntentType;
    options?: IntentOptions;
}

/**
  AgentBrain: Rule Based Autonomous Decision Engine
  Evaluates on-chain state against a set of configurable rules and
  produces an action plan that the agent executes. This is the
  autonomous decision making layer that turns a wallet into an agent.
  Lifecycle:  Perceive → Evaluate Rules → Produce Plan → Execute
**/ 
export class AgentBrain {
    private rules: AgentRule[] = [];
    private state: AgentState;

    constructor(private agent: AIAgent) {
        this.state = createInitialState(agent.name, agent.getPublicKey());
        this.loadDefaultRules();
    }

    /**
      Load the default rule set. Rules are evaluated in priority order (lowest first).
    **/
    private loadDefaultRules(): void {
        const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

        this.rules = [
            {
                label: 'FUND_IF_LOW',
                priority: 1,
                condition: (s) => s.solBalance < 0.005,
                action: 'FUND',
                buildOptions: () => undefined,
            },
            {
                label: 'ATTEST_CYCLE',
                priority: 10,
                condition: (s) => s.solBalance >= 0.005,
                action: 'DEFI_EXECUTION',
                buildOptions: (s) => ({
                    transaction: new Transaction().add({
                        keys: [{ pubkey: this.agent.getPublicKey(), isSigner: true, isWritable: true }],
                        programId: MEMO_PROGRAM_ID,
                        data: Buffer.from(`ATTEST:${s.name}:CYCLE_${s.cyclesCompleted + 1}:${Date.now()}`, 'utf-8'),
                    }),
                }),
            },
        ];

        this.rules.sort((a, b) => a.priority - b.priority);
    }

    /**
      Add a custom rule to the brain at runtime.
    **/
    addRule(rule: AgentRule): void {
        this.rules.push(rule);
        this.rules.sort((a, b) => a.priority - b.priority);
    }

    /**
      Perceive: Refresh the agent's state from on-chain data.
    **/
    async perceive(): Promise<AgentState> {
        this.state.solBalance = await this.agent.getBalance();
        logger.agent(this.agent.name, `Perceived SOL balance: ${this.state.solBalance.toFixed(4)} SOL`);
        return this.state;
    }

    /**
      Evaluate: Run all rules against current state and return the first matching action plan.
      Returns null if no rules fire.
    **/
    evaluate(): ActionPlan | null {
        for (const rule of this.rules) {
            if (rule.condition(this.state)) {
                logger.agent(this.agent.name, `Rule fired: ${rule.label} → ${rule.action}`);
                return {
                    ruleFired: rule.label,
                    action: rule.action,
                    options: rule.buildOptions(this.state),
                };
            }
        }
        logger.agent(this.agent.name, 'No rules matched current state.');
        return null;
    }

    /**
      Execute: Run a single Perceive → Evaluate → Act cycle.
      Returns the action that was taken, or null if no action was needed.
    **/
    async runCycle(): Promise<ActionPlan | null> {
        logger.agent(this.agent.name, `--- Decision Cycle ${this.state.cyclesCompleted + 1} ---`);

        await this.perceive();

        const plan = this.evaluate();

        if (!plan) {
            this.state.cyclesCompleted++;
            return null;
        }

        try {
            await this.agent.executeIntent(plan.action, plan.options);
            this.state.lastAction = plan.ruleFired;
            this.state.lastActionTimestamp = Date.now();
            logger.agent(this.agent.name, `Action completed: ${plan.ruleFired}`);
        } catch (error: any) {
            logger.agent(this.agent.name, `Action failed (${plan.ruleFired}): ${error.message}`);
        }

        this.state.cyclesCompleted++;
        return plan;
    }

    /**
      Get the current agent state (read-only snapshot).
    **/
    getState(): Readonly<AgentState> {
        return { ...this.state };
    }
}
