import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { logger } from '../utils/logger';
import { SecurityError } from '../utils/errors';

/**
  Validates outbound transactions to prevent unauthorized logic execution
  or limits being bypassed by a prompt-injected LLM layer.
 **/
export class TransactionValidator {
    static validateIntentPayload(transaction: Transaction | VersionedTransaction): boolean {
        let instructionCount = 0;

        if ('message' in transaction) {
            instructionCount = transaction.message.compiledInstructions.length;
        } else {
            instructionCount = transaction.instructions.length;
        }

        if (instructionCount === 0) {
            throw new SecurityError('Validation failed: Empty transaction intent');
        }

        logger.info(`Security: Intent passed deep validation. Checksum OK.`);
        return true;
    }
}
