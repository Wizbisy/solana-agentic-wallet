import { PublicKey, Transaction } from '@solana/web3.js';
import { AgenticWallet } from './AgenticWallet';
import { SolanaRpcService } from '../services/RpcService';
import { IntentOrchestrator } from '../intents/IntentOrchestrator';
import { IntentType, IntentOptions } from '../intents/types';
import { logger } from '../utils/logger';

/**
  The Master Class that wraps the Secure Boundaries and Intent Strategies.
  Any top-level external application or LLM flow interacts SOLELY with this class.
 **/
export class AIAgent {
    private wallet: AgenticWallet;
    private orchestrator: IntentOrchestrator;
    private rpcService: SolanaRpcService;
    public readonly name: string;

    constructor(name: string) {
        this.name = name;
        this.rpcService = new SolanaRpcService();
        this.wallet = new AgenticWallet(name, this.rpcService);
        this.orchestrator = new IntentOrchestrator(this.wallet, this.rpcService);

        logger.agent(this.name, `Agent Online. Public Address: ${this.wallet.getPublicKey().toBase58()}`);
    }

    /**
      Retrieve the active Solana Balance from the RPC.
    **/
    public async getBalance(): Promise<number> {
        return await this.rpcService.getBalance(this.wallet.getPublicKey());
    }

    public getPublicKey(): PublicKey {
        return this.wallet.getPublicKey();
    }

    /**
      Send a top-level Intent downstream into the secure execution pipeline.
    **/
    public async executeIntent(type: IntentType, options?: IntentOptions): Promise<any> {
        return await this.orchestrator.executeIntent(type, options);
    }
}
