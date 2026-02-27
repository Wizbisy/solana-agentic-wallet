import { 
    Connection, Keypair, PublicKey, Transaction, SystemProgram 
} from '@solana/web3.js';
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    transfer,
    getAccount,
    Account,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { ENV } from '../config/env';
import { logger } from '../utils/logger';

/**
 SPL Token Service
 
  Provides programmatic token operations for autonomous agents:
   Create new token mints
   Manage Associated Token Accounts (ATAs)
   Mint tokens (when agent has mint authority)
   Transfer tokens between agents
   Query token balances
 **/
export class SplTokenService {
    private connection: Connection;

    constructor() {
        this.connection = new Connection(ENV.SOLANA_RPC_URL, 'confirmed');
    }

    /**
      Create a new SPL token mint. The payer becomes the mint authority.
    **/ 
    async createTokenMint(payer: Keypair, decimals: number = 9): Promise<PublicKey> {
        const mint = await createMint(
            this.connection,
            payer,
            payer.publicKey,   
            payer.publicKey,   
            decimals
        );
        logger.info(`Token mint created: ${mint.toBase58()}`);
        return mint;
    }

    /**
      Get or create an Associated Token Account for the given owner + mint.
      If the ATA does not exist, the payer covers rent.
    **/
    async getOrCreateAta(
        payer: Keypair,
        mint: PublicKey,
        owner: PublicKey
    ): Promise<Account> {
        const ata = await getOrCreateAssociatedTokenAccount(
            this.connection,
            payer,
            mint,
            owner
        );
        return ata;
    }

    /**
      Mint tokens to a destination ATA. Caller must be the mint authority.
    **/
    async mintTokens(
        payer: Keypair,
        mint: PublicKey,
        destination: PublicKey,
        amount: number,
        decimals: number = 9
    ): Promise<string> {
        const rawAmount = amount * Math.pow(10, decimals);
        const signature = await mintTo(
            this.connection,
            payer,
            mint,
            destination,
            payer, 
            rawAmount
        );
        logger.info(`Minted ${amount} tokens to ${destination.toBase58().slice(0, 12)}...`);
        return signature;
    }

    /**
      Transfer SPL tokens from one ATA to another.
    **/
    async transferTokens(
        payer: Keypair,
        sourceAta: PublicKey,
        destAta: PublicKey,
        owner: Keypair,
        amount: number,
        decimals: number = 9
    ): Promise<string> {
        const rawAmount = amount * Math.pow(10, decimals);
        const signature = await transfer(
            this.connection,
            payer,
            sourceAta,
            destAta,
            owner,
            rawAmount
        );
        logger.info(`Transferred ${amount} tokens`);
        return signature;
    }

    /**
      Get the token balance for a given ATA address.
    **/
    async getTokenBalance(ataAddress: PublicKey): Promise<number> {
        try {
            const account = await getAccount(this.connection, ataAddress);
            return Number(account.amount);
        } catch {
            return 0;
        }
    }
}
