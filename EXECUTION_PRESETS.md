# Execution Presets Reference

Advanced execution blueprints for the Solana Agent Wallet. This document defines the exact standard operating procedures (SOPs) for constructing complex payloads for the `DEFI_EXECUTION` pipeline.

Agents MUST consult this guide when constructing any interaction that isn't a basic `TRANSFER` or `FUND` intent. Each preset contains production-ready code blocks that produce valid `Transaction` or `VersionedTransaction` objects.

---

## ⚠️ CRITICAL: The `DEFI_EXECUTION` Pipeline Rule

The `DEFI_EXECUTION` Intent accepts *any* valid `Transaction` or `VersionedTransaction`. Therefore, this module supports every Solana dApp inherently without requiring updates to the core wallet infrastructure.

**However, the Agent must never guess the buffer structure of complex programs.** It must fetch them via verified APIs.

### Preset Quick Reference

| # | Preset | Complexity | API Required | Transaction Type | Lines |
|---|--------|------------|-------------|-----------------|-------|
| 1 | Jupiter Aggregator Swap | High | ✅ Jupiter V6 | `VersionedTransaction` | ~60 |
| 2 | Mainnet Priority Fees | Medium | ❌ Optional | Legacy `Transaction` | ~30 |
| 3 | SPL Token Transfer | Medium | ❌ | Legacy `Transaction` | ~40 |
| 4 | SPL Memo (On-Chain Message) | Low | ❌ | Legacy `Transaction` | ~15 |
| 5 | Account Cleanup (Rent Reclaim) | Medium | ❌ | Legacy `Transaction` | ~30 |
| 6 | Marinade Liquid Staking | High | ✅ Marinade SDK/API | `VersionedTransaction` | ~25 |
| 7 | Raydium AMM Swap | High | ✅ Raydium API | `VersionedTransaction` | ~20 |
| 8 | Orca Whirlpool Swap | High | ✅ Orca SDK | `VersionedTransaction` | ~25 |
| 9 | Wrapped SOL Operations | Medium | ❌ | Legacy `Transaction` | ~35 |
| 10 | Batch Multi-Instruction Tx | Medium | ❌ | Legacy `Transaction` | ~25 |
| 11 | PDA Derivation & Lookups | Low | ❌ | N/A (Read-Only) | ~15 |
| 12 | Token-2022 Extensions | High | ❌ | Legacy `Transaction` | ~30 |
| 13 | Commander Fleet Funding | Low | ❌ | Uses `TRANSFER` intent | ~20 |

---

## Unit Conversion Helpers

Before calling any API, convert the user's human-readable amounts into their correct on-chain denominations:

```typescript
// SOL has 9 decimals
const solToLamports = (sol: number): number => Math.floor(sol * 1_000_000_000);

// USDC has 6 decimals
const usdcToSmallest = (usdc: number): number => Math.floor(usdc * 1_000_000);

// Generic converter for any SPL token
const toSmallestUnit = (amount: number, decimals: number): number => {
    return Math.floor(amount * (10 ** decimals));
};

// Reverse: lamports to SOL
const lamportsToSol = (lamports: number): number => lamports / 1_000_000_000;
```

### Quick Conversion Table

| Token | 1 Unit = | Decimals |
|-------|----------|----------|
| SOL | 1,000,000,000 lamports | 9 |
| USDC | 1,000,000 smallest | 6 |
| USDT | 1,000,000 smallest | 6 |
| BONK | 100,000 smallest | 5 |
| RAY | 1,000,000 smallest | 6 |

---

## 1. Jupiter Aggregator Swap (V6 API)

When a user requests a token swap (e.g., "Swap SOL for USDC"), you must execute a multi-step API flow to get the Base64 response, deserialize it into a `VersionedTransaction`, and execute it.

### Common Token Mints

| Token | Mint Address | Decimals |
|-------|-------------|----------|
| SOL (Wrapped) | `So11111111111111111111111111111111111111112` | 9 |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | 5 |
| JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` | 6 |
| mSOL | `mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So` | 9 |

### Step 1: Fetch the Quote

Always fetch the optimal route first. The quote endpoint returns routing information without committing to a transaction.

```typescript
const inputMint = "So11111111111111111111111111111111111111112";  // SOL
const outputMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
const amountLamports = solToLamports(1); // 1 SOL = 1,000,000,000 lamports

const quoteResponse = await (
  await fetch(
    `https://quote-api.jup.ag/v6/quote?` +
    `inputMint=${inputMint}` +
    `&outputMint=${outputMint}` +
    `&amount=${amountLamports}` +
    `&slippageBps=50` +        // 0.5% slippage tolerance
    `&onlyDirectRoutes=false`   // Allow multi-hop for better rates
  )
).json();

// Log route details for transparency
console.log(`Route: ${quoteResponse.routePlan.length} hops`);
console.log(`Expected output: ${quoteResponse.outAmount} (smallest unit)`);
console.log(`Price impact: ${quoteResponse.priceImpactPct}%`);
console.log(`Minimum received: ${quoteResponse.otherAmountThreshold}`);
```

### Step 2: Fetch the Serialized Transaction

Pass the quote directly to the `/swap` endpoint with the Agent's public key.

```typescript
const { swapTransaction } = await (
  await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: agent.getPublicKey().toString(),
      wrapAndUnwrapSol: true,  // Auto-handle WSOL wrapping/unwrapping
      // Let Jupiter optimize compute budget automatically
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto'  // Auto priority fees for Mainnet
    })
  })
).json();
```

### Step 3: Deserialize & Execute (CRITICAL)

Convert the base64 string to a buffer, cast it to a `VersionedTransaction`, and dispatch.

```typescript
import { VersionedTransaction } from '@solana/web3.js';

// 1. Convert base64 API string to a raw buffer
const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');

// 2. Deserialize natively using @solana/web3.js
const versionedTransaction = VersionedTransaction.deserialize(swapTransactionBuf);

// 3. Dispatch to secure execution
// AgenticWallet handles: Simulation → Signing → Dispatch → Confirmation
await agent.executeIntent('DEFI_EXECUTION', {
    transaction: versionedTransaction
});
```

### Jupiter Slippage Configuration

| Scenario | slippageBps | Risk Level |
|----------|------------|------------|
| Stablecoins (USDC↔USDT) | 10 (0.1%) | Very Low |
| Major pairs (SOL↔USDC) | 50 (0.5%) | Low |
| Mid-cap tokens | 100 (1%) | Medium |
| Low-liquidity tokens | 300-500 (3-5%) | High |
| Memecoins | 500-1000 (5-10%) | Very High |

### Jupiter Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `ROUTE_NOT_FOUND` | No liquidity path between tokens | Try higher slippage or different pair |
| `SLIPPAGE_EXCEEDED` | Price moved during execution | Retry with fresh quote |
| `INSUFFICIENT_BALANCE` | Not enough input token | Fund the wallet first |
| `Transaction too large` | Route uses too many accounts | Jupiter auto-uses ALTs for v0 |

---

## 2. Mainnet Priority Fees (Compute Budget)

On Mainnet, execution will frequently fail or drop without a competitive compute limit and priority fee. If the user is operating in a congested environment and constructing a *custom* manual payload, explicitly attach these instructions.

*(Note: If using Jupiter API as above, the API handles Priority Fees automatically via `prioritizationFeeLamports: 'auto'`).*

### Static Priority Fee

Use when you know the approximate compute cost:

```typescript
import { ComputeBudgetProgram, Transaction } from "@solana/web3.js";

// 1. Set compute unit limit (prevents overpaying if fewer units are needed)
const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
  units: 500_000 // Standard for moderate DeFi interactions
});

// 2. Set priority fee per compute unit
const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
  microLamports: 20_000 // Adjust based on network congestion
});

// 3. Build the payload — compute instructions MUST come FIRST
const transaction = new Transaction()
  .add(modifyComputeUnits)
  .add(addPriorityFee)
  .add(/* ... your core protocol instructions here ... */);

await agent.executeIntent('DEFI_EXECUTION', { transaction });
```

### Dynamic Priority Fee (Recommended for Production)

Fetch the current recommended fee from your RPC provider:

```typescript
// Using Helius / Triton getPriorityFeeEstimate (if supported by your RPC)
const response = await fetch(rpcUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'getPriorityFeeEstimate',
    params: [{
      accountKeys: [/* relevant program IDs for your transaction */],
      options: { recommended: true }
    }]
  })
});

const { result } = await response.json();
const recommendedFee = result.priorityFeeEstimate; // in micro-lamports
```

### Alternative: getRecentPrioritizationFees (Standard RPC)

```typescript
// Available on all RPC providers
const fees = await connection.getRecentPrioritizationFees();

// Calculate the median fee
const sortedFees = fees
  .filter(f => f.prioritizationFee > 0)
  .sort((a, b) => a.prioritizationFee - b.prioritizationFee);

const medianFee = sortedFees[Math.floor(sortedFees.length / 2)]?.prioritizationFee || 10_000;
console.log(`Median priority fee: ${medianFee} micro-lamports`);
```

### Priority Fee Reference Table

| Network State | microLamports | Approx. Cost (1M CU) |
|--------------|--------------|----------------------|
| Quiet | 1,000 | ~0.001 SOL |
| Normal | 10,000 | ~0.01 SOL |
| Congested | 50,000 | ~0.05 SOL |
| Extreme | 200,000+ | ~0.2 SOL |

---

## 3. SPL Token Transfers

For transferring SPL tokens (USDC, BONK, etc.) between wallets. This requires handling Associated Token Accounts (ATAs).

### Step 1: Check Recipient's ATA

Before transferring, verify the recipient has an ATA for the token mint:

```typescript
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { PublicKey, Transaction, Connection } from '@solana/web3.js';

const mint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"); // USDC
const sender = agent.getPublicKey();
const recipient = new PublicKey("RECIPIENT_ADDRESS_HERE");

// Derive ATAs deterministically
const senderAta = await getAssociatedTokenAddress(mint, sender);
const recipientAta = await getAssociatedTokenAddress(mint, recipient);
```

### Step 2: Build the Transfer Transaction

```typescript
const connection = new Connection(rpcUrl, 'confirmed');
const transaction = new Transaction();

// Check if recipient ATA exists
const recipientAtaInfo = await connection.getAccountInfo(recipientAta);

if (!recipientAtaInfo) {
  // Recipient doesn't have an ATA — create one (sender pays ~0.002 SOL rent)
  transaction.add(
    createAssociatedTokenAccountInstruction(
      sender,       // payer (pays rent)
      recipientAta, // ATA to create
      recipient,    // owner of the new ATA
      mint          // token mint
    )
  );
}

// Add the transfer instruction
const amount = 10_000_000; // 10 USDC (6 decimals)
transaction.add(
  createTransferInstruction(
    senderAta,    // source ATA
    recipientAta, // destination ATA
    sender,       // owner/authority
    amount        // amount in smallest units
  )
);

await agent.executeIntent('DEFI_EXECUTION', { transaction });
```

### Idempotent ATA Creation (Safer Alternative)

If you're unsure whether the ATA exists:

```typescript
import { createAssociatedTokenAccountIdempotentInstruction } from '@solana/spl-token';

// This will NOT fail if the ATA already exists
transaction.add(
  createAssociatedTokenAccountIdempotentInstruction(
    sender,       // payer
    recipientAta, // ATA address
    recipient,    // owner
    mint          // token mint
  )
);
```

---

## 4. SPL Memo Program (On-Chain Messages)

Use the Memo program to write immutable text directly to the Solana ledger. Useful for on-chain annotations, audit trails, or agent-to-agent communication proofs.

```typescript
import { PublicKey, Transaction } from '@solana/web3.js';

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const message = "AGENT_EXECUTION_VERIFIED_VIA_NEXUS";

// Validate message size (max 566 bytes for memo program)
const messageBytes = Buffer.from(message, 'utf-8');
if (messageBytes.length > 566) {
  throw new Error(`Memo exceeds 566 byte limit (got ${messageBytes.length})`);
}

const memoPayload = new Transaction().add({
    keys: [{ pubkey: agent.getPublicKey(), isSigner: true, isWritable: true }],
    programId: MEMO_PROGRAM_ID,
    data: messageBytes,
});

await agent.executeIntent('DEFI_EXECUTION', {
    transaction: memoPayload
});
```

### Use Cases for Memo

| Scenario | Example Message |
|----------|----------------|
| Audit proof | `INTENT:TRANSFER:0.05SOL:E5kh3g...` |
| Agent coordination | `TASK_COMPLETE:swap:5x9Y2v...` |
| On-chain note | `Agent initialized at 2026-02-25T19:53:28Z` |
| Payment reference | `INVOICE:INV-2026-001` |

---

## 5. Account Cleanup (Rent Reclaim)

Over time, agent wallets accumulate empty SPL token accounts that hold rent-exempt lamports (~0.00203928 SOL each). Closing these accounts reclaims the SOL.

### Step 1: Find Empty Token Accounts

```typescript
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection(rpcUrl, 'confirmed');
const owner = agent.getPublicKey();

// Fetch all token accounts owned by this wallet
const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
  programId: TOKEN_PROGRAM_ID,
});

// Filter accounts with exactly 0 balance
const emptyAccounts = tokenAccounts.value.filter(
  (account) => account.account.data.parsed.info.tokenAmount.uiAmount === 0
);

console.log(`Found ${emptyAccounts.length} empty token accounts.`);
console.log(`Potential reclaim: ~${(emptyAccounts.length * 0.00203928).toFixed(4)} SOL`);
```

### Step 2: Build Cleanup Transaction

```typescript
import { createCloseAccountInstruction } from '@solana/spl-token';
import { Transaction } from '@solana/web3.js';

const transaction = new Transaction();

// Close up to 20 accounts per transaction (to stay within size limits)
const batchSize = Math.min(emptyAccounts.length, 20);

for (let i = 0; i < batchSize; i++) {
  transaction.add(
    createCloseAccountInstruction(
      emptyAccounts[i].pubkey,  // Token account to close
      owner,                     // SOL destination (receives rent)
      owner                      // Account owner/authority
    )
  );
}

await agent.executeIntent('DEFI_EXECUTION', { transaction });

console.log(`Closed ${batchSize} accounts.`);
console.log(`Reclaimed ~${(batchSize * 0.00203928).toFixed(4)} SOL in rent.`);
```

### Batch Processing for Large Cleanups

If you have more than 20 empty accounts, split into multiple transactions:

```typescript
const BATCH_SIZE = 20;
const totalBatches = Math.ceil(emptyAccounts.length / BATCH_SIZE);

for (let batch = 0; batch < totalBatches; batch++) {
  const transaction = new Transaction();
  const start = batch * BATCH_SIZE;
  const end = Math.min(start + BATCH_SIZE, emptyAccounts.length);

  for (let i = start; i < end; i++) {
    transaction.add(
      createCloseAccountInstruction(emptyAccounts[i].pubkey, owner, owner)
    );
  }

  await agent.executeIntent('DEFI_EXECUTION', { transaction });
  console.log(`Batch ${batch + 1}/${totalBatches} completed.`);
}
```

---

## 6. Marinade Liquid Staking (mSOL)

For staking SOL and receiving mSOL (liquid staking token). The mSOL token represents staked SOL that earns yield while remaining liquid.

### Using Marinade SDK

```typescript
// Requires: npm install @marinade.finance/marinade-ts-sdk
import { Marinade, MarinadeConfig } from '@marinade.finance/marinade-ts-sdk';
import { Connection } from '@solana/web3.js';

const config = new MarinadeConfig({
  connection: new Connection(rpcUrl, 'confirmed'),
  publicKey: agent.getPublicKey(),
});

const marinade = new Marinade(config);

// Deposit SOL → receive mSOL
const { transaction } = await marinade.deposit(
  solToLamports(1) // 1 SOL
);

await agent.executeIntent('DEFI_EXECUTION', { transaction });
```

### Without SDK (API Approach)

If the Marinade SDK is not installed, use their API endpoint:

```typescript
// 1. Fetch the staking transaction from Marinade API
const response = await fetch('https://api.marinade.finance/v1/deposit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: solToLamports(1),
    userPublicKey: agent.getPublicKey().toString()
  })
});

const { transaction: base64Tx } = await response.json();

// 2. Deserialize and execute (same pattern as Jupiter)
const buffer = Buffer.from(base64Tx, 'base64');
const versionedTx = VersionedTransaction.deserialize(buffer);

await agent.executeIntent('DEFI_EXECUTION', { transaction: versionedTx });
```

### Unstaking mSOL → SOL

```typescript
// Immediate unstake (uses liquidity pool, may have slight fee)
const { transaction } = await marinade.liquidUnstake(
  solToLamports(1) // 1 mSOL
);

await agent.executeIntent('DEFI_EXECUTION', { transaction });
```

---

## 7. Raydium AMM Swaps

For swaps via Raydium concentrated liquidity pools. Uses Raydium's API for transaction construction.

```typescript
// 1. Fetch swap transaction from Raydium API
const quoteResponse = await (
  await fetch(
    `https://api.raydium.io/v2/main/swap` +
    `?inputMint=${inputMint}` +
    `&outputMint=${outputMint}` +
    `&amount=${amountLamports}` +
    `&slippage=0.5` +       // 0.5% slippage
    `&txVersion=V0`           // Request VersionedTransaction
  )
).json();

// 2. Deserialize and execute each transaction in the response
const { data: swapTransactions } = quoteResponse;

for (const base64Tx of swapTransactions) {
  const buffer = Buffer.from(base64Tx, 'base64');
  const versionedTx = VersionedTransaction.deserialize(buffer);

  await agent.executeIntent('DEFI_EXECUTION', {
    transaction: versionedTx
  });
}
```

---

## 8. Orca Whirlpool Swaps

For swaps via Orca's concentrated liquidity pools (Whirlpools).

### Using Orca SDK

```typescript
// Requires: npm install @orca-so/whirlpools-sdk @orca-so/common-sdk
import { WhirlpoolContext, buildWhirlpoolClient, ORCA_WHIRLPOOL_PROGRAM_ID } from "@orca-so/whirlpools-sdk";
import { Wallet } from "@coral-xyz/anchor";

const ctx = WhirlpoolContext.withProvider(
  provider,
  ORCA_WHIRLPOOL_PROGRAM_ID
);
const client = buildWhirlpoolClient(ctx);

// Get the SOL/USDC whirlpool
const whirlpool = await client.getPool(whirlpoolAddress);

// Get swap quote
const quote = await swapQuoteByInputToken(
  whirlpool,
  inputMint,
  new BN(amountLamports),
  slippageTolerance,
  ctx.program.programId,
  fetcher
);

// Build the swap transaction
const tx = await whirlpool.swap(quote);

// Extract the transaction and execute
await agent.executeIntent('DEFI_EXECUTION', {
  transaction: tx.transaction
});
```

### Without SDK (API Approach)

```typescript
// Use Orca's API endpoint for pre-built transactions
const response = await fetch('https://api.orca.so/v1/swap', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    inputMint,
    outputMint,
    amount: amountLamports,
    slippageBps: 50,
    userPublicKey: agent.getPublicKey().toString()
  })
});

const { transaction: base64Tx } = await response.json();
const buffer = Buffer.from(base64Tx, 'base64');
const versionedTx = VersionedTransaction.deserialize(buffer);

await agent.executeIntent('DEFI_EXECUTION', { transaction: versionedTx });
```

---

## 9. Wrapped SOL (WSOL) Operations

Native SOL cannot be used directly in SPL Token programs. You must wrap it first into WSOL (Wrapped SOL).

### Wrapping SOL → WSOL

```typescript
import {
  createSyncNativeInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddress,
  NATIVE_MINT,
} from '@solana/spl-token';
import { SystemProgram, Transaction } from '@solana/web3.js';

const owner = agent.getPublicKey();
const wsolAta = await getAssociatedTokenAddress(NATIVE_MINT, owner);

const wrapAmount = solToLamports(1); // 1 SOL

const transaction = new Transaction()
  // 1. Create WSOL ATA if it doesn't exist
  .add(createAssociatedTokenAccountIdempotentInstruction(owner, wsolAta, owner, NATIVE_MINT))
  // 2. Transfer SOL into the WSOL ATA
  .add(SystemProgram.transfer({
    fromPubkey: owner,
    toPubkey: wsolAta,
    lamports: wrapAmount
  }))
  // 3. Sync the native balance to reflect as WSOL
  .add(createSyncNativeInstruction(wsolAta));

await agent.executeIntent('DEFI_EXECUTION', { transaction });
```

### Unwrapping WSOL → SOL

```typescript
import { createCloseAccountInstruction } from '@solana/spl-token';

// Closing the WSOL ATA returns all lamports (including wrapped SOL) to the owner
const transaction = new Transaction().add(
  createCloseAccountInstruction(
    wsolAta,  // WSOL token account
    owner,    // SOL destination
    owner     // authority
  )
);

await agent.executeIntent('DEFI_EXECUTION', { transaction });
```

---

## 10. Batch Multi-Instruction Transactions

Combine multiple operations into a single atomic transaction. If any instruction fails, the entire transaction reverts.

### Example: Transfer + Memo in One Transaction

```typescript
import { SystemProgram, Transaction, PublicKey } from '@solana/web3.js';

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const recipient = new PublicKey("RECIPIENT_ADDRESS");
const owner = agent.getPublicKey();

const transaction = new Transaction()
  // Instruction 1: SOL Transfer
  .add(SystemProgram.transfer({
    fromPubkey: owner,
    toPubkey: recipient,
    lamports: solToLamports(0.1)
  }))
  // Instruction 2: Attach a memo as proof
  .add({
    keys: [{ pubkey: owner, isSigner: true, isWritable: true }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from("PAYMENT:INV-2026-001", "utf-8"),
  });

// Both instructions execute atomically
await agent.executeIntent('DEFI_EXECUTION', { transaction });
```

### Example: Create ATA + Transfer + Memo

```typescript
const transaction = new Transaction()
  .add(createAssociatedTokenAccountIdempotentInstruction(owner, recipientAta, recipient, mint))
  .add(createTransferInstruction(senderAta, recipientAta, owner, amount))
  .add({
    keys: [{ pubkey: owner, isSigner: true, isWritable: true }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from("SPL_TRANSFER:USDC:10", "utf-8"),
  });

await agent.executeIntent('DEFI_EXECUTION', { transaction });
```

### Transaction Size Warning

When batching, monitor total size:
- Each instruction adds approximately 40-200 bytes
- Maximum transaction size: **1232 bytes**
- If approaching the limit, split into sequential transactions
- For complex batches, consider `VersionedTransaction` with Address Lookup Tables

---

## 11. PDA Derivation & Account Lookups

Program Derived Addresses (PDAs) are deterministic addresses owned by programs. Used to find accounts without storing them.

### Deriving a PDA

```typescript
import { PublicKey } from '@solana/web3.js';

const programId = new PublicKey("YOUR_PROGRAM_ID");

// Derive a PDA from seeds
const [pda, bump] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("user_account"),                    // string seed
    agent.getPublicKey().toBuffer(),                 // pubkey seed
  ],
  programId
);

console.log(`PDA: ${pda.toBase58()}`);
console.log(`Bump: ${bump}`);
```

### Common PDA Patterns

| Pattern | Seeds | Used By |
|---------|-------|---------|
| User account | `["user", userPubkey]` | Most programs |
| Token vault | `["vault", mint, pool]` | AMMs, lending |
| Metadata | `["metadata", metadataProgram, mint]` | Metaplex |
| Edition | `["metadata", metadataProgram, mint, "edition"]` | Metaplex |
| ATA | `[ownerPubkey, TOKEN_PROGRAM_ID, mint]` | SPL Token |

### Checking if a PDA Account Exists

```typescript
const accountInfo = await connection.getAccountInfo(pda);

if (accountInfo === null) {
  console.log("PDA account does not exist yet — needs initialization.");
} else {
  console.log(`PDA exists. Data length: ${accountInfo.data.length} bytes`);
  console.log(`Owner program: ${accountInfo.owner.toBase58()}`);
  console.log(`Lamports: ${accountInfo.lamports}`);
}
```

---

## 12. Token-2022 Extensions

Solana's Token-2022 program extends SPL Token with additional features. When dealing with Token-2022 tokens, use the correct program ID.

### Detecting Token-2022 Tokens

```typescript
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Check which program owns the mint
const mintInfo = await connection.getAccountInfo(mintAddress);

if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
  console.log("This is a Token-2022 token");
  // Use TOKEN_2022_PROGRAM_ID for all interactions
} else if (mintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
  console.log("This is a standard SPL Token");
  // Use TOKEN_PROGRAM_ID for all interactions
}
```

### Transfer Token-2022 Tokens

```typescript
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token';

// For Token-2022, specify the program ID explicitly
const senderAta = getAssociatedTokenAddressSync(
  mint, sender, false, TOKEN_2022_PROGRAM_ID
);
const recipientAta = getAssociatedTokenAddressSync(
  mint, recipient, false, TOKEN_2022_PROGRAM_ID
);

const transaction = new Transaction().add(
  createTransferCheckedInstruction(
    senderAta,
    mint,
    recipientAta,
    sender,
    amount,
    decimals,
    [],
    TOKEN_2022_PROGRAM_ID  // Must specify Token-2022 program
  )
);

await agent.executeIntent('DEFI_EXECUTION', { transaction });
```

### Common Token-2022 Extensions

| Extension | Purpose | Impact on Agent |
|-----------|---------|----------------|
| Transfer Fee | Charges fee on every transfer | Agent must account for fee in amount |
| Interest Bearing | Accrues interest over time | Balance changes without transactions |
| Non-Transferable | Soulbound tokens | Transfer will be rejected |
| Permanent Delegate | Program can burn/transfer at will | Higher risk assessment needed |
| Confidential Transfer | Encrypted amounts | Cannot read balance directly |

---

## Troubleshooting Payloads

### Pre-flight Validation Fails

If `agent.executeIntent` returns an immediate failure citing the `Pre-flight validation`, diagnose using this table:

| Error Pattern | Cause | Resolution |
|--------------|-------|------------|
| `InsufficientFundsForRent` | Not enough SOL for account rent | Fund wallet via `FUND` intent |
| `SlippageToleranceExceeded` | Price moved beyond slippage bps | Retry with fresh quote from API |
| `AccountNotFound` | Target ATA or account doesn't exist | Create ATA first (see Preset 3) |
| `ProgramFailedToComplete` | Instruction data encoding error | Verify instruction layout matches IDL |
| `BlockhashNotFound` | Transaction stale, blockhash expired | Retry — fresh blockhash auto-attached |
| `TransactionTooLarge` | Exceeds 1232 bytes | Use VersionedTransaction with ALTs |
| `AccountAlreadyInitialized` | Trying to create existing account | Use idempotent creation instruction |
| `InvalidAccountData` | Wrong account passed to instruction | Verify PDA derivation and ATAs |
| `PrivilegeEscalation` | Signing with wrong authority | Check owner/authority fields |

### Base64 Deserialization Errors

If `VersionedTransaction.deserialize` throws a type error or length mismatch:

1. **Verify encoding**: Ensure you are using `Buffer.from(string, 'base64')` exactly as shown.
2. **Check message version**: Verify the API returned a v0 compatible message.
3. **Legacy fallback**: If the API returned a legacy message, use `Transaction.from(buffer)` instead of `VersionedTransaction.deserialize(buffer)`.
4. **Inspect raw bytes**: Log `buffer.length` and `buffer[0]` to determine the message format:
   - `buffer[0] === 128 (0x80)` → v0 message (use `VersionedTransaction.deserialize`)
   - Otherwise → legacy message (use `Transaction.from`)

### ATA Does Not Exist

If a token transfer fails because the recipient doesn't have an Associated Token Account:

1. **Query first**: Always call `connection.getAccountInfo(recipientAta)` before transferring.
2. **Create inline**: Prepend `createAssociatedTokenAccountInstruction` to the same transaction.
3. **Sender pays rent**: The sender (agent wallet) pays the ~0.002 SOL rent for the new ATA.
4. **Idempotent creation**: Use `createAssociatedTokenAccountIdempotentInstruction` to be safe.

### Token-2022 Compatibility

If a transaction fails with "incorrect program id for instruction":
1. Check which program owns the token mint (Token Program vs Token-2022).
2. Use the correct program ID for ATA derivation and transfer instructions.
3. Account for transfer fees if the token has the Transfer Fee extension enabled.

---

## 13. Commander Fleet Funding (Multi-Agent)

When deploying multiple agents on Devnet, avoid individual airdrop requests which hit rate limits (429). Instead, fund one agent manually and have it distribute SOL to all peers.

### Step 1: Identify the Commander

```typescript
const agents: AIAgent[] = fleet.map(name => new AIAgent(name));
const balances = await Promise.all(agents.map(a => a.getBalance()));

let commanderIdx = 0;
for (let i = 1; i < balances.length; i++) {
    if (balances[i] > balances[commanderIdx]) commanderIdx = i;
}

const commander = agents[commanderIdx];
console.log(`Commander: ${commander.name} (${balances[commanderIdx]} SOL)`);
```

### Step 2: Distribute SOL to Peers

```typescript
const FUND_AMOUNT = 0.05; // SOL per agent

for (let i = 0; i < agents.length; i++) {
    if (i === commanderIdx) continue;
    if (balances[i] >= 0.01) continue; // already funded

    await commander.executeIntent('TRANSFER', {
        target: agents[i].getPublicKey(),
        amount: FUND_AMOUNT,
    });
}
```

### Why This Works

| Approach | Airdrop per Agent | Commander Model |
|----------|------------------|-----------------|
| RPC calls | N airdrops (rate limited) | 1 manual fund + N-1 transfers |
| 429 errors | Frequent | None |
| Speed | Slow (retry backoff) | Fast (2s per transfer) |
| Automation | Breaks on rate limits | Fully automated after initial fund |
