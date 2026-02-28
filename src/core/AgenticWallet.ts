import { Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { KeyManager } from '../security/KeyManager';
import { TransactionValidator } from '../security/TransactionValidator';
import { SolanaRpcService } from '../services/RpcService';
import { logger } from '../utils/logger';

/**
  AgenticWallet Implementation.
  Encapsulates the KMS subsystem and strictly delegates transactions.
 **/
export class AgenticWallet {
    private keypair: Keypair;
    private rpcService: SolanaRpcService;
    public readonly name: string;

    constructor(name: string, rpcService: SolanaRpcService) {
        this.name = name;
        this.rpcService = rpcService;       
        this.keypair = KeyManager.loadOrGenerate(name);
    }

    public getPublicKey(): PublicKey {
        return this.keypair.publicKey;
    }

    public getName(): string {
        return this.name;
    }

    /**
      The only function that accesses the raw explicit `secretKey`.
      Receives fully built intents, validates them cryptographically, signs them, and dispatches.
    **/
    public async signAndSendTransaction(transaction: Transaction | VersionedTransaction): Promise<string> {
        TransactionValidator.validateIntentPayload(transaction);

        logger.info(`Vault [${this.name}]: Internal validation passed. Attaching secure signature.`);
        
        await this.rpcService.attachRecentBlockhash(transaction, this.keypair.publicKey);
        
        logger.info(`Vault [${this.name}]: Executing Pre flight validation...`);
        const simResult = await this.rpcService.simulateTransaction(transaction);
        if (!simResult) {
            throw new Error(`Pre flight validation failed. Context aborted before signing.`);
        }
        logger.success(`Vault [${this.name}]: Pre flight validation OK.`);

        if ('message' in transaction) {
            transaction.sign([this.keypair]);
        } else {
            transaction.sign(this.keypair);
        }

        return await this.rpcService.sendTransaction(transaction);
    }
}
