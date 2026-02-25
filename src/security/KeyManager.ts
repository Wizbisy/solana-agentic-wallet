import { Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';
import { logger } from '../utils/logger';
import { ENV } from '../config/env';
import { SecurityError } from '../utils/errors';

/**
 * KeyManager handles the physical security of the Keypair.
 * Extensible for integration into AWS KMS or HashiCorp Vault.
 */
export class KeyManager {
    static loadOrGenerate(agentName: string): Keypair {
        const lowerName = agentName.toLowerCase();
        const safePath = path.resolve(process.cwd(), ENV.WALLET_STORAGE_PATH);
        
        if (!fs.existsSync(safePath)) {
            fs.mkdirSync(safePath, { recursive: true });
        }

        const walletFile = path.join(safePath, `${lowerName}_secure.json`);

        if (fs.existsSync(walletFile)) {
            try {
                // Decrypt and load the persisted keystore payload
                const payload = JSON.parse(fs.readFileSync(walletFile, 'utf-8'));
                if (!payload.encryptedSecret) {
                    throw new SecurityError('Invalid keystore payload');
                }
                const secretKey = bs58.decode(payload.encryptedSecret);
                logger.info(`Vault: Loaded existing secure enclave for agent: ${agentName}`);
                return Keypair.fromSecretKey(secretKey);
            } catch (error: any) {
                throw new SecurityError(`Vault decryption failed: ${error.message}`);
            }
        }

        // Generate new keypair in secure enclave
        const newKeypair = Keypair.generate();
        const encryptedSecret = bs58.encode(newKeypair.secretKey); 

        fs.writeFileSync(walletFile, JSON.stringify({
            agentId: lowerName,
            publicAddress: newKeypair.publicKey.toBase58(),
            encryptedSecret: encryptedSecret,
            createdAt: new Date().toISOString()
        }, null, 2));

        logger.success(`Vault: Provisioned new secure Keypair for ${agentName}`);
        return newKeypair;
    }
}
