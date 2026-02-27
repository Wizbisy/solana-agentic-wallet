---
name: solana-agent-wallet
description: "Agent Skill: Comprehensive Solana Agentic Wallet integration for autonomous execution. AUTOMATICALLY TRIGGER when user mentions Solana wallets like 'Send 0.05 SOL to <addr>', 'Swap SOL for USDC via Jupiter', or 'Check my devnet balance'. Use when funding agent wallets, executing generic smart contract transactions, interacting with DeFi, checking balances, or initializing agent keypairs. Handles secure intent-based execution on both Devnet and Mainnet where the AgenticWallet signs and dispatches the raw transaction intents constructed by the calling agent. If rate limits are hit on Devnet, automatically applies sleep retries. Supports any modern Solana DeFi standard via the Intent Engine."
---

# Solana Agent Wallet Skill

Securely execute intents on the Solana blockchain. This skill acts as an immutable boundary between the AI Agent and the physical `Keypair`, allowing agents to build complex DeFi payloads while maintaining absolute cryptographic security during signing and dispatch.

This repository was specifically engineered to solve the "Prompt Injection" problem for AI crypto agents, ensuring that even if an LLM is hijacked, it cannot extract the private key. The architecture enforces a strict vault-and-orchestrator model where all key material is physically sandboxed from the agent's decision context.

---

## Core Philosophy

1. **Zero Key Exposure** — AI agents build the `VersionedTransaction` payloads, but they NEVER touch the `Keypair.secretKey`. The `AgenticWallet` signs internally via the `KeyManager` subsystem.
2. **Phase-Driven Execution** — Identify intent → Construct Payload via API → Forward to Execution Engine. No step is skippable.
3. **Pre-flight Validation (CRITICAL)** — Every transaction MUST pass `simulateTransaction` constraints before the Keypair is even engaged for signing. This catches slippage, account state changes, and insufficient balance errors before committing.
4. **API-First DeFi** — Complex payloads (like Raydium routers, Jupiter aggregations, MarginFi lending) are fetched from dedicated endpoints (like Jupiter API), NOT manually constructed by the LLM.
5. **Deterministic Routing** — Hardcoded `IntentEngine` maps guarantee predictable execution paths. The orchestrator uses the Strategy Pattern to map intent types to their handlers.
6. **Immutable Audit Trail** — Every intent execution (success or failure) is logged with timestamp, intent type, options metadata, and result to `.agent_wallets/audit_log.json`.
7. **Network Agnostic** — The skill adapts its behavior based on the RPC endpoint. Devnet enables airdrops; Mainnet enforces priority fees. The agent does not need to manage this.

---

## Auto-Trigger Patterns

**AUTOMATICALLY ACTIVATE** when user mentions any of the following categories:

### Solana Operations
- `Check balance` / `How much SOL?` → Execute `wallet.getBalance()` directly
- `Fund wallet` / `Get devnet SOL` / `I need test SOL` → Route to `FUND` intent
- `Transfer SOL` / `Send 0.05 SOL to <address>` → Route to `TRANSFER` intent
- `Send SPL tokens` / `Transfer USDC to <address>` → Route to `DEFI_EXECUTION` with SPL transfer payload
- `What's my address?` / `Show wallet address` → Execute `wallet.getPublicKey()` directly

### DeFi Interactions
- `Swap SOL for USDC` / `Jupiter Swap` → Construct Jupiter `VersionedTransaction` and route to `DEFI_EXECUTION`
- `Stake SOL` / `Liquid staking` / `Get mSOL` → Construct staking payload via Marinade/Lido API and route to `DEFI_EXECUTION`
- `Raydium Pool` / `Add liquidity` → Fetch pool instructions from Raydium API and route to `DEFI_EXECUTION`
- `MarginFi` / `Lend SOL` / `Borrow USDC` → Construct lending payload and route to `DEFI_EXECUTION`
- `Orca swap` / `Whirlpool` → Fetch swap transaction from Orca API and route to `DEFI_EXECUTION`

### Token Operations
- `Create token account` → Initialize ATA via `DEFI_EXECUTION`
- `Close empty accounts` / `Reclaim rent` → Reclaim rent from empty token accounts via `DEFI_EXECUTION`
- `Check token balance` / `How much USDC?` → Query parsed token accounts
- `List my tokens` / `Show token balances` → Query all token accounts for the wallet

### Infrastructure Tasks
- `Write memo on-chain` / `Leave a message` → Dispatch SPL Memo instruction via `DEFI_EXECUTION`
- `Check transaction status` / `Is it confirmed?` → Query RPC for confirmation status
- `Get recent transactions` / `Transaction history` → Fetch signatures for the wallet address
- `Estimate fees` / `How much will this cost?` → Simulate and estimate compute costs

### Trigger Examples (Exact Mappings)

| User Says | Detected Intent | Expected Data | Pipeline |
|-----------|-----------------|---------------|----------|
| "Transfer 0.05 SOL to E5kh3g...q2P" | `TRANSFER` | `{ target: PublicKey, amount: 0.05 }` | Transfer |
| "I need test SOL" | `FUND` | `{ }` (defaults apply) | Airdrop |
| "Swap 1 SOL for USDC via Jupiter" | `DEFI_EXECUTION` | `{ transaction: VersionedTransaction }` | DeFi |
| "Check my balance" | Direct Call | `wallet.getBalance()` | Read-Only |
| "Write 'hello' on-chain" | `DEFI_EXECUTION` | `{ transaction: Transaction }` (Memo) | Custom |
| "Close my empty token accounts" | `DEFI_EXECUTION` | `{ transaction: Transaction }` (Close ATA) | Cleanup |
| "Send 50 USDC to Bob's wallet" | `DEFI_EXECUTION` | `{ transaction: Transaction }` (SPL Transfer) | Token |
| "Stake 2 SOL with Marinade" | `DEFI_EXECUTION` | `{ transaction: VersionedTransaction }` | Staking |
| "What tokens do I have?" | Direct Call | Parsed token accounts query | Read-Only |
| "What's my wallet address?" | Direct Call | `wallet.getPublicKey()` | Read-Only |

---

## ⚠️ CRITICAL: The `DEFI_EXECUTION` Pattern

**This pattern is mandatory for complex smart contract interactions. Do not manually attempt to construct raw `@solana/web3.js` buffers for aggregated swaps without extensive IDLs.**

### The Golden Rule

```
Agent builds intent → API returns base64 → Agent deserializes → AgenticWallet simulates → AgenticWallet signs → Network dispatch
The Agent NEVER signs. The Agent NEVER touches secretKey. The Agent NEVER skips simulation.
```

### Step-by-Step

1. **Fetch**: The Agent MUST utilize a dedicated API (e.g., the Jupiter Routing API) to fetch base64 encoded transaction instructions.
2. **Deserialize**: The Agent MUST deserialize the API's base64/buffer response natively into a `VersionedTransaction` (or legacy `Transaction`) object.
3. **Execute**: The correctly deserialized object is then passed downstream to `DEFI_EXECUTION`.

### Agent Decision Tree

When the user requests on-chain action, follow this decision tree exactly:

```
User Request
│
├─ Is it a simple SOL transfer?
│   ├─ YES → Use TRANSFER intent (built-in)
│   └─ NO ↓
│
├─ Is it a balance or address query?
│   ├─ YES → Direct RPC call (no intent needed)
│   └─ NO ↓
│
├─ Is it a Devnet funding request?
│   ├─ YES → Use FUND intent (built-in)
│   └─ NO ↓
│
├─ Is it a simple known program (Memo, basic SPL transfer)?
│   ├─ YES → Manually construct Transaction, route to DEFI_EXECUTION
│   └─ NO ↓
│
├─ Is it a complex DeFi operation (swap, stake, lend, LP)?
│   ├─ YES → MUST use external API to get base64 payload
│   │         Deserialize into VersionedTransaction
│   │         Route to DEFI_EXECUTION
│   └─ NO ↓
│
└─ Unknown operation → Ask user for clarification
```

### When Manual Construction Is Acceptable

For simple, well-documented programs with stable instruction layouts, the Agent MAY construct the `Transaction` manually:

| Protocol | Manual OK? | Reason |
|----------|------------|--------|
| System Program (SOL Transfer) | ✅ Yes | Handled natively by `TRANSFER` intent |
| SPL Memo Program | ✅ Yes | Single instruction, stable layout |
| SPL Token (basic transfer) | ⚠️ Careful | Must handle ATA creation checks |
| SPL Token (with ATA init) | ⚠️ Careful | Multi-instruction, sender pays rent |
| Close Token Account | ✅ Yes | Single instruction, well-documented |
| Jupiter Aggregated Swap | ❌ Never | Complex route with Address Lookup Tables |
| Raydium AMM | ❌ Never | Complex pool state, requires fresh reserves |
| Orca Whirlpool | ❌ Never | Concentrated liquidity math |
| MarginFi Lending | ❌ Never | Account initialization + obligation management |
| Marinade Staking | ❌ Never | Validator delegation + mSOL minting |
| Metaplex NFT Ops | ❌ Never | Complex account creation + metadata handling |

*(See `EXECUTION_PRESETS.md` for exact code blueprints on every supported protocol).*

---

## Sub-Skills

This module contains specialized internal systems that work together:

| Sub-Skill | Component | Purpose |
|-----------|-----------|---------|
| `agent-brain` | `AgentBrain.ts` + `AgentState.ts` | Autonomous decision engine with rule-based Perceive → Evaluate → Act loop |
| `agentic-wallet` | `AgenticWallet.ts` + `KeyManager.ts` | Physical keypair security, vault signing, and network execution |
| `spl-tokens` | `SplTokenService.ts` | SPL token mint, ATA management, token transfers, and balance queries |
| `intent-engine` | `IntentOrchestrator.ts` + Handlers | Evaluation of AI choices and raw transaction construction routing |
| `rpc-layer` | `RpcService.ts` | Network abstraction, simulation, blockhash management, and dispatch |
| `audit-chain` | `AuditLogger.ts` | Immutable logging of every intent execution to the JSON data store |
| `security-gate` | `TransactionValidator.ts` | Cryptographic bounds-checking of intent payloads before signing |

---

## Phase 0: Intent Detection & Lifecycle

First, determine what the user wants to accomplish on-chain and map it to the exact lifecycle step.

### Mode A: Direct Transfers (`TRANSFER`)
- User wants to move SOL from their agent Vault to a specific `PublicKey`.
- *Example Triggers*: "Transfer 0.05 SOL to E5kh3gwsE2U...q2P", "Send SOL to my other wallet"
- Proceed to Phase 1 (Transfer Pipeline)
- *Expected Data Needed*: Recipient Base58 address (string), Amount in SOL (float).
- *Validation*: Recipient address must be a valid 32-byte Base58 encoded Solana public key. Amount must be positive and non-zero.

### Mode B: Devnet Funding (`FUND`)
- User needs test SOL to cover gas fees or staging deployment.
- *Example Triggers*: "I need test SOL for this agent", "Fund the wallet", "Get devnet airdrop"
- Proceed to Phase 1 (Airdrop Pipeline)
- *Expected Data Needed*: None (defaults apply). Optionally accepts an `amount` in SOL.
- *Validation*: Only available on Devnet. If Mainnet is detected, warn the user that airdrops are not available.

### Mode C: Complex Payload (`DEFI_EXECUTION`)
- User wants to swap tokens, stake, interact with a custom program, or execute any non-trivial on-chain operation.
- *Example Triggers*: "Swap 1 SOL for USDC via Jupiter", "Stake my SOL", "Write a memo on-chain"
- Proceed to Phase 1 (DeFi Pipeline, requires external API for complex operations)
- *Expected Data Needed*: A fully deserialized `VersionedTransaction` or `Transaction` object.
- *Validation*: The transaction object must be non-null, must contain at least one instruction, and must not exceed the Solana transaction size limit (1232 bytes).

### Mode D: Read-Only Actions
- User simply wants to get the current balance, check tokens, or view address.
- *Example Triggers*: "Check balance", "How much SOL do I have?", "What's my address?", "List my tokens"
- Execute `wallet.getBalance()`, `wallet.getPublicKey()`, or token account queries directly.
- *No intent routing needed* — these are pure RPC reads.

---

## Phase 1: Payload Construction

Based on the detected mode, construct the specific `IntentOptions` payload. You must format the payload EXACTLY as shown.

### 1. The `FUND` Intent

Requests Devnet SOL from the RPC Faucet. Amount is optional and defaults to the node's maximum allowable limit to avoid rate-crash errors.

```typescript
// Recommended: leave amount undefined for maximum allowable safe limit
await agent.executeIntent('FUND');

// Explicit amount override (may be throttled by the faucet)
await agent.executeIntent('FUND', { amount: 1 });
```

**Fallback Behavior**: If the RPC faucet returns a 429 rate-limit error, the `FundIntentHandler` will:
1. Log the error to the audit trail.
2. Print the faucet URL to the console for manual claiming.
3. Return `false` to the caller to indicate manual intervention is needed.

**Pre-conditions:**
- Network MUST be Devnet or Testnet
- The wallet address must not be on the faucet's rate-limit blocklist
- If the faucet returns less than expected, the system handles this gracefully

### 2. The `TRANSFER` Intent

Standard system program transfer. You must cast the target string to a `PublicKey` object before passing.

```typescript
import { PublicKey } from '@solana/web3.js';

const targetAddr = new PublicKey("E5kh3gwsE2ULjG9U...");

await agent.executeIntent('TRANSFER', {
    target: targetAddr,
    amount: 1.5 // Floating point SOL (will be converted to lamports internally)
});
```

**Internal Conversion**: The `TransferIntentHandler` converts the floating-point SOL amount to lamports (`amount * 1e9`) before constructing the `SystemProgram.transfer` instruction.

**Pre-conditions:**
- Wallet must have sufficient SOL balance (amount + estimated fees)
- Target address must be a valid Solana public key
- Amount must be greater than 0

**Post-conditions:**
- Transaction signature is returned on success
- Balance is reduced by amount + transaction fee (~0.000005 SOL)
- Audit log records the intent, target, amount, and result

### 3. The `DEFI_EXECUTION` Intent

Requires a fully constructed `@solana/web3.js` object (`VersionedTransaction` or legacy `Transaction`). You **must** read `EXECUTION_PRESETS.md` for the blueprint on constructing these via APIs. Do not append manual signers if extracting from an API.

```typescript
// From Jupiter API (VersionedTransaction)
const buffer = Buffer.from(apiBase64Response, 'base64');
const versionedTx = VersionedTransaction.deserialize(buffer);

await agent.executeIntent('DEFI_EXECUTION', {
    transaction: versionedTx
});

// From manual construction (Legacy Transaction)
const legacyTx = new Transaction().add(/* instructions */);

await agent.executeIntent('DEFI_EXECUTION', {
    transaction: legacyTx
});
```

**Pre-conditions:**
- Transaction must not be null/undefined
- Transaction must contain at least 1 instruction
- Transaction size must be ≤ 1232 bytes
- For VersionedTransaction: the message must be properly formatted v0

**Post-conditions:**
- Pre-flight simulation passes before signing
- Transaction is signed by the AgenticWallet's Keypair
- Network dispatch occurs with confirmation waiting
- Full audit trail is recorded

---

## Phase 2: Execution & Validation Architecture

Once the Intent is constructed, pass it to the `AIAgent`. Here is the strict architecture that protects the private key at every step:

### The Execution Pipeline

```
Agent.executeIntent()
  │
  ├─► IntentOrchestrator.execute()
  │     │
  │     ├─► Sanitize & log intent metadata (strip raw bytes, count instructions)
  │     │     └── For VersionedTransaction: count compiledInstructions
  │     │     └── For legacy Transaction: count instructions array
  │     │
  │     ├─► Route to correct IntentHandler (Strategy Pattern)
  │     │     ├── FUND → FundIntentHandler
  │     │     ├── TRANSFER → TransferIntentHandler
  │     │     └── DEFI_EXECUTION → DefiExecutionHandler
  │     │
  │     └─► Handler builds/passes Transaction to AgenticWallet
  │
  ├─► AgenticWallet.signAndSendTransaction()
  │     │
  │     ├─► TransactionValidator.validateIntentPayload()
  │     │     └── Checks: instruction count > 0
  │     │     └── Checks: serialized size ≤ 1232 bytes
  │     │     └── Checks: no suspicious program IDs
  │     │
  │     ├─► RpcService.attachRecentBlockhash()
  │     │     └── For v0: Override message.recentBlockhash
  │     │     └── For legacy: Set recentBlockhash + feePayer
  │     │
  │     ├─► RpcService.simulateTransaction()   ◄── PRE-FLIGHT GATE
  │     │     └── Sends unsigned transaction to RPC for dry-run
  │     │     └── If simulation fails → HARD ABORT (no signing occurs)
  │     │     └── Returns detailed error logs for debugging
  │     │
  │     ├─► Keypair.sign()   ◄── ONLY point where secretKey is accessed
  │     │     └── For v0: transaction.sign([keypair])
  │     │     └── For legacy: transaction.sign(keypair)
  │     │
  │     └─► RpcService.sendTransaction()
  │           └── Dispatches signed bytes via sendRawTransaction
  │           └── Waits for confirmation via confirmTransaction
  │           └── Returns transaction signature string
  │
  └─► AuditLogger.logIntentExecution()
        └── Records: intent type, timestamp, agent name, result, metadata
        └── Writes to: .agent_wallets/audit_log.json
        └── Both success and failure are logged
```

### Security Invariants

These invariants are NEVER violated, regardless of agent behavior:

1. **The `secretKey` never leaves `AgenticWallet`** — No method returns or logs the key bytes. The `KeyManager.loadOrGenerate()` method returns a `Keypair` object that is stored as a private class member.
2. **Simulation happens BEFORE signing** — A malicious transaction cannot trick the wallet into signing first. The simulation uses the unsigned transaction bytes.
3. **The `TransactionValidator` runs BEFORE simulation** — Structural validation (instruction count, size) happens before any RPC call, preventing malformed transactions from reaching the network layer.
4. **Audit logging happens regardless of outcome** — Both successful and failed intents are recorded for forensic review. The log includes the intent type, options metadata (with sensitive bytes stripped), and the result.
5. **The Agent cannot bypass the Orchestrator** — There is no public method on `AgenticWallet` that accepts raw instructions without going through the intent pipeline.
6. **The Keypair file is never read by the agent** — Only `KeyManager.ts` reads `.agent_wallets/*_wallet.json`. The agent code has no import path to this data.

---

## Phase 3: Failure Handling & Error States

When executing operations, the Agent must gracefully handle standard blockchain constraints without failing the entire node process.

### Devnet Rate Limits (Error 429)

If Devnet throws a `429 Too Many Requests` during a `FUND` or transaction execution, **do not crash**.

**Symptoms:**
- `RPC Airdrop failed: 429 Too Many Requests`
- Multiple rapid `FUND` calls in succession
- Faucet returns empty or reduced amounts

**Agent Response:**
1. Catch the exception.
2. Log the faucet URL to the console for manual claiming.
3. Return `false` so the caller can handle the failure.

**Multi-Agent Demo Fallback (3-stage):**
The `multi-agent-demo.ts` implements a progressive funding strategy:

1. **Check balances** — if any agent already has SOL, it becomes Commander.
2. **Try airdrop** — attempts `FUND` intent for the first agent.
3. **Browser fallback** — if airdrop fails (429), opens the default browser to `https://faucet.solana.com/?address=<ADDRESS>` and waits for the user to press Enter after funding.
4. **Commander distributes** — the funded agent distributes SOL to all unfunded peers via `TRANSFER`.

```typescript
// Stage 1: Try airdrop
await firstAgent.executeIntent('FUND', { amount: 1 });

// Stage 2: If airdrop fails, open browser to faucet
exec(`start https://faucet.solana.com/?address=${address}`);
// Wait for user to fund and press Enter...

// Stage 3: Commander distributes to peers
for (const peer of unfundedAgents) {
    await commander.executeIntent('TRANSFER', {
        target: peer.getPublicKey(),
        amount: 0.05,
    });
}
```

### Mainnet Congestion (Priority Fees)

When operating on Mainnet, standard transactions may drop or hang indefinitely during severe network congestion.

**Symptoms:**
- Transaction confirmed after 60+ seconds
- Transaction dropped entirely (no confirmation)
- `TransactionExpiredBlockheightExceededError`

**Agent Response:**
1. Detect Mainnet context via `SOLANA_RPC_URL`.
2. Dynamically fetch and prepend a compute budget instruction (Priority Fee) to the payload.
3. Use the Jupiter API's built-in `prioritizationFeeLamports: 'auto'` flag when using Jupiter swaps.
4. For custom payloads, see `EXECUTION_PRESETS.md` for the `ComputeBudgetProgram` blueprint.

### Pre-Flight Rejection

If the `AgenticWallet` throws a `Validation Failed` error, it means the `simulateTransaction` safety check caught a problem.

**Common Causes:**
| Error | Meaning | Fix |
|-------|---------|-----|
| `InsufficientFundsForRent` | Account doesn't have enough SOL for rent exemption | Fund the wallet first |
| `SlippageToleranceExceeded` | Price moved beyond allowed bounds | Retry with fresh quote |
| `AccountNotFound` | Target account doesn't exist | Create ATA first |
| `ProgramFailedToComplete` | Instruction logic error | Check instruction data encoding |
| `BlockhashNotFound` | Transaction took too long to submit | Retry with fresh blockhash |
| `AccountAlreadyInitialized` | Trying to create an existing account | Use idempotent creation |
| `InsufficientFunds` | Not enough SOL for transfer + fees | Fund wallet or reduce amount |

### Transaction Size Limits

Solana transactions are limited to 1232 bytes. Complex DeFi operations (especially multi-hop Jupiter swaps) may exceed this limit with legacy `Transaction` objects. This is precisely why the `VersionedTransaction` format with Address Lookup Tables exists.

**If you hit size limits:**
1. Ensure you are using `VersionedTransaction` (not legacy `Transaction`).
2. Verify the API is returning v0 messages with Address Lookup Tables.
3. If building manually, reduce the number of instructions per transaction.
4. Split large operations into multiple sequential transactions.

---

## Module System Architecture

Understand the internal structure to know where to interface:

### Core Components

| File | Purpose | Agent Access |
|------|---------|-------------|
| `src/core/AIAgent.ts` | Public orchestrator interface. Used to invoke intents. | **Full Access** |
| `src/core/AgenticWallet.ts` | Vault border. Signs bytes and executes simulations. | **Via intents only** |
| `src/agent/AgentBrain.ts` | Rule-based autonomous decision engine (Perceive → Evaluate → Act) | **Full Access** |
| `src/agent/AgentState.ts` | Persistent state tracking (SOL balance, token balances, cycles, last action) | **Full Access** |
| `src/intents/IntentOrchestrator.ts` | Routing handler (Strategy Pattern). Maps parameters to handlers. | Internal |
| `src/intents/types.ts` | Intent type definitions and option interfaces. | Reference |

### Intent Handlers

| File | Intent Type | What It Does |
|------|-------------|-------------|
| `src/intents/handlers/FundIntent.ts` | `FUND` | Requests Devnet airdrop, logs faucet URL on failure |
| `src/intents/handlers/TransferIntent.ts` | `TRANSFER` | Builds `SystemProgram.transfer` instruction |
| `src/intents/handlers/DefiIntent.ts` | `DEFI_EXECUTION` | Passes pre-built transactions directly to the Wallet |

### Services

| File | Purpose | Agent Access |
|------|---------|-------------|
| `src/services/SplTokenService.ts` | SPL token mint creation, ATA management, token minting and transfers | **Full Access** |
| `src/services/RpcService.ts` | Network connection, simulation, blockhash, and dispatch. | Internal |

### Infrastructure

| File | Purpose | Agent Access |
|------|---------|-------------|
| `src/security/KeyManager.ts` | Physical Keypair loader/generator. | **Zero Access** (Sandboxed) |
| `src/security/TransactionValidator.ts` | Validates instruction count and payload structure. | Internal |
| `src/db/AuditLogger.ts` | JSON store for intent execution outcomes. | Internal |
| `src/config/env.ts` | Environment variable binding and defaults. | Reference |
| `src/config/constants.ts` | Static configuration constants. | Reference |
| `src/utils/logger.ts` | Formatted CLI logging utility. | Internal |
| `src/utils/errors.ts` | Custom error classes (`NetworkError`, etc.). | Reference |

---

## Authentication & Security Boundaries

**CRITICAL**: The Private Key (`.agent_wallets/*_wallet.json`) is strictly secured and MUST NOT be extracted, logged, or included in any LLM context.

### Key Isolation Architecture

```
┌─────────────────────────────────────────────────────┐
│  AI Agent Context (LLM-accessible)                  │
│                                                     │
│  ┌──────────────┐  ┌───────────────────────┐        │
│  │  AIAgent.ts  │  │  IntentOrchestrator   │        │
│  │  (public)    │──│  (routes intents)     │        │
│  └──────────────┘  └───────────────────────┘        │
│                              │                      │
├──────────────────────────────┼──────────────────────┤
│  VAULT BOUNDARY (No LLM access below this line)     │
│                              │                      │
│  ┌───────────────────────────▼──────────────────┐   │
│  │           AgenticWallet                       │   │
│  │  ┌─────────────┐  ┌──────────────────────┐   │   │
│  │  │ KeyManager  │  │ TransactionValidator  │   │   │
│  │  │ (secretKey) │  │ (bounds checking)     │   │   │
│  │  └─────────────┘  └──────────────────────┘   │   │
│  └──────────────────────────────────────────────┘   │
│                              │                      │
│  ┌───────────────────────────▼──────────────────┐   │
│  │           RpcService                          │   │
│  │  ┌──────────────┐  ┌─────────────────────┐   │   │
│  │  │ simulate()   │  │ sendTransaction()   │   │   │
│  │  │ (pre-flight) │  │ (network dispatch)  │   │   │
│  │  └──────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### What the Agent CAN Do
- Call `agent.executeIntent()` with properly formatted options
- Call `agent.getWalletAddress()` to get the public key
- Call `agent.getBalance()` to check SOL balance
- Read the audit log file for historical intent results
- Query token accounts via RPC
- Construct `Transaction` or `VersionedTransaction` objects
- Deserialize API responses into transaction objects

### What the Agent CANNOT Do
- Access `Keypair.secretKey` or any derived private material
- Sign transactions outside the intent pipeline
- Bypass `TransactionValidator` checks
- Skip pre-flight simulation
- Modify the `KeyManager` or `AgenticWallet` internal state
- Read the `.agent_wallets/*_wallet.json` file directly
- Override the audit logger behavior

---

## Advanced: Token Operations

### Querying Token Balances

To check SPL token balances, query the RPC directly:

```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const connection = new Connection(rpcUrl, 'confirmed');
const owner = agent.getPublicKey();

// Get all token accounts
const tokenAccounts = await connection.getParsedTokenAccountsByOwner(owner, {
  programId: TOKEN_PROGRAM_ID,
});

// Display balances
for (const { account } of tokenAccounts.value) {
  const info = account.data.parsed.info;
  console.log(`Mint: ${info.mint}`);
  console.log(`Balance: ${info.tokenAmount.uiAmountString}`);
  console.log(`Decimals: ${info.tokenAmount.decimals}`);
}
```

### Token Metadata Resolution

To get human-readable token names and symbols, query the token metadata:

```typescript
// Option A: Use Jupiter Token List API (recommended)
const tokenList = await (
  await fetch('https://token.jup.ag/strict')
).json();

const tokenInfo = tokenList.find(t => t.address === mintAddress);
if (tokenInfo) {
  console.log(`${tokenInfo.symbol}: ${tokenInfo.name}`);
  console.log(`Decimals: ${tokenInfo.decimals}`);
  console.log(`Logo: ${tokenInfo.logoURI}`);
}

// Option B: Use on-chain Metaplex metadata (for NFTs / custom tokens)
// Requires @metaplex-foundation/mpl-token-metadata
```

---

## Advanced: Balance Monitoring & Thresholds

### Checking Balance Before Execution

Always verify sufficient balance before attempting transactions:

```typescript
const balance = await agent.getBalance();

// Minimum balance check (0.01 SOL covers most transaction fees)
const MIN_BALANCE = 0.01;
if (balance < MIN_BALANCE) {
    console.warn(`Low balance: ${balance} SOL. Funding required.`);
    await agent.executeIntent('FUND');
}

// Check if balance covers the intended transfer
const transferAmount = 1.5;
const estimatedFee = 0.000005; // ~5000 lamports
if (balance < transferAmount + estimatedFee) {
    console.error(`Insufficient balance: ${balance} SOL < ${transferAmount + estimatedFee} SOL needed.`);
    return;
}
```

### Multi-Token Balance Check

```typescript
// Check if agent has enough USDC for a specific operation
const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const usdcAta = await getAssociatedTokenAddress(usdcMint, agent.getPublicKey());

try {
    const usdcAccount = await getAccount(connection, usdcAta);
    const usdcBalance = Number(usdcAccount.amount) / 1e6; // 6 decimals
    console.log(`USDC Balance: ${usdcBalance}`);
} catch {
    console.log(`No USDC token account found. Balance: 0`);
}
```

---

## Advanced: Transaction History & Status

### Fetching Recent Transactions

```typescript
const signatures = await connection.getSignaturesForAddress(
    agent.getPublicKey(),
    { limit: 10 },
    'confirmed'
);

for (const sig of signatures) {
    console.log(`Sig: ${sig.signature}`);
    console.log(`  Slot: ${sig.slot}`);
    console.log(`  Time: ${new Date(sig.blockTime * 1000).toISOString()}`);
    console.log(`  Status: ${sig.err ? 'FAILED' : 'SUCCESS'}`);
}
```

### Checking Transaction Confirmation

```typescript
const status = await connection.getSignatureStatus(signature, {
    searchTransactionHistory: true
});

if (status.value?.confirmationStatus === 'finalized') {
    console.log('Transaction is finalized (irreversible).');
} else if (status.value?.confirmationStatus === 'confirmed') {
    console.log('Transaction is confirmed (high confidence).');
} else {
    console.log('Transaction is still processing...');
}
```

---

## Payload Structure Quick Reference

**Important**: The `agent.executeIntent()` method accepts explicitly typed payloads.

| Intent | Expected Options | Transaction Type | Built-In? |
|--------|------------------|------------------|-----------|
| `FUND` | `{ amount?: number }` | N/A (RPC Airdrop) | ✅ Yes |
| `TRANSFER` | `{ target: PublicKey, amount: number }` | Legacy `Transaction` (built internally) | ✅ Yes |
| `DEFI_EXECUTION` | `{ transaction: Transaction \| VersionedTransaction }` | Caller-provided | Agent builds payload |
| `TOKEN_TRANSFER` | `{ target: PublicKey, amount: number, mint: PublicKey }` | Legacy `Transaction` (built internally) | ✅ Yes |

### Common Token Mint Addresses

For convenience when constructing DeFi payloads:

| Token | Mint Address | Decimals | Network |
|-------|-------------|----------|---------|
| SOL (Wrapped) | `So11111111111111111111111111111111111111112` | 9 | All |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 | Mainnet |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 | Mainnet |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | 5 | Mainnet |
| JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` | 6 | Mainnet |
| RAY | `4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R` | 6 | Mainnet |
| mSOL | `mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So` | 9 | Mainnet |
| stSOL | `7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj` | 9 | Mainnet |

### Lamport Conversion Reference

| Amount | Lamports | Notes |
|--------|----------|-------|
| 1 SOL | 1,000,000,000 | 9 decimals |
| 0.1 SOL | 100,000,000 | Common test amount |
| 0.001 SOL | 1,000,000 | Approximate rent for 1 account |
| 0.000005 SOL | 5,000 | Approximate base transaction fee |
| 1 USDC | 1,000,000 | 6 decimals |

---

## Quick Start Configuration

Set up your local instance and environment variables to ensure the module boots correctly.

```bash
# Install core dependencies
# Required: @solana/web3.js, bs58, dotenv, chalk, open
npm install

# Configure network in .env file
# Missing this will default the system to Devnet
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com  # For Mainnet deployments
SOLANA_RPC_URL=https://api.devnet.solana.com        # For Devnet deployments

# Defines the name of the Agent, which dictates the Vault keypair loaded
AGENT_NAME="Nexus-Prime"

# Defines where the audit logs and keypair JSONs are generated
WALLET_STORAGE_PATH=".agent_wallets"

# Execute the application
npm start
```

### Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOLANA_RPC_URL` | No | `https://api.devnet.solana.com` | RPC endpoint |
| `AGENT_NAME` | No | `"Nexus-Prime"` | Agent keypair identifier |
| `WALLET_STORAGE_PATH` | No | `".agent_wallets"` | Keypair + audit directory |
| `ENVIRONMENT` | No | `"development"` | Environment label |

---

## Extending the Intent Engine

To add a new intent type (e.g., `STAKE`, `NFT_MINT`, `BATCH`), follow these steps:

### Step 1: Define the Intent Type
Add the new type to `src/intents/types.ts`:
```typescript
export type IntentType = 'FUND' | 'TRANSFER' | 'DEFI_EXECUTION' | 'TOKEN_TRANSFER' | 'STAKE';
```

### Step 2: Create the Handler
Create a new file `src/intents/handlers/StakeIntent.ts` implementing the `IntentHandler` interface:
```typescript
import { IntentHandler } from '../types';

export class StakeIntentHandler implements IntentHandler {
    constructor(
        private wallet: AgenticWallet,
        private rpc: SolanaRpcService
    ) {}

    async execute(options?: IntentOptions): Promise<string | boolean> {
        // 1. Validate staking amount from options
        const amount = options?.amount || 1;

        // 2. Fetch staking transaction from Marinade API
        const response = await fetch('https://api.marinade.finance/v1/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: amount * 1e9,
                userPublicKey: this.wallet.getPublicKey().toString()
            })
        });
        const { transaction: base64Tx } = await response.json();

        // 3. Deserialize the base64 response
        const buffer = Buffer.from(base64Tx, 'base64');
        const versionedTx = VersionedTransaction.deserialize(buffer);

        // 4. Pass to AgenticWallet for simulation, signing, and dispatch
        return await this.wallet.signAndSendTransaction(versionedTx);
    }
}
```

### Step 3: Register in the Orchestrator
Add the handler to the strategy map in `IntentOrchestrator.ts`:
```typescript
this.handlers.set('STAKE', new StakeIntentHandler(this.wallet, this.rpc));
```

The orchestrator will now automatically route `STAKE` intents to your new handler, complete with audit logging and error handling.

---

## Network Detection & Environment Awareness

The skill automatically detects the target network from the `SOLANA_RPC_URL` environment variable:

| URL Contains | Detected Network | Airdrop Available | Priority Fees Needed |
|-------------|-----------------|-------------------|---------------------|
| `devnet` | Devnet | ✅ Yes | ❌ No |
| `testnet` | Testnet | ✅ Yes | ❌ No |
| `mainnet` | Mainnet | ❌ No | ✅ Yes |
| Custom RPC | Unknown | ❌ Assume No | ✅ Assume Yes |

**Automatic Behaviors:**
- On Devnet: `FUND` intent uses `requestAirdrop`. Rate limits are handled gracefully with browser fallback.
- On Mainnet: `FUND` intent should be rejected or warn the user. Priority fees should be attached to all `DEFI_EXECUTION` payloads.
- On Custom RPC: Treat as Mainnet for safety. Priority fees are recommended.

---

## Retry & Backoff Strategies

When encountering transient errors, apply these strategies:

### RPC Rate Limits (429)
```
Attempt 1: Execute immediately
Attempt 2: Wait 2 seconds, retry
Attempt 3: Wait 5 seconds, retry
Attempt 4: Fail gracefully, open faucet browser (for FUND) or return error
```

### Blockhash Expiry
```
If TransactionExpiredBlockheightExceededError:
  1. Fetch new blockhash via getLatestBlockhash()
  2. Re-attach to transaction
  3. Re-sign and re-submit
  4. Max 3 retries before failing
```

### Simulation Failure
```
If simulateTransaction returns error:
  1. Log the exact error from result.value.err
  2. DO NOT retry automatically (state may have changed)
  3. Return the error to the agent for decision-making
  4. Agent must re-fetch quote/payload before retrying
```

### Network Timeout
```
If connection timeout or ECONNREFUSED:
  1. Wait 3 seconds
  2. Retry with same parameters
  3. Max 2 retries
  4. If still failing, suggest the user check their RPC URL
```

---

## Multi-Agent Coordination Patterns

When multiple AI agents share the same wallet infrastructure:

### Commander Funding Model (Recommended)
- On first run, the demo attempts an airdrop for the first agent.
- If the airdrop fails (429), it **opens the browser** to the Solana Faucet with the address pre-filled.
- The user funds manually, presses Enter, and the funded agent becomes Commander.
- Commander distributes SOL to all unfunded peers via `TRANSFER` intent.
- No manual intervention needed after the initial fund.
- Run via: `npm run agent:multi`

### Shared Wallet (Not Recommended)
- Multiple agents use the same `AGENT_NAME`, accessing the same keypair.
- Risk: Race conditions on nonce/blockhash. One agent's transaction may invalidate another's.
- Mitigation: Implement a transaction queue with mutex locks.

### Dedicated Wallets (Recommended)
- Each agent uses a unique `AGENT_NAME`, generating separate keypairs.
- Example: `AGENT_NAME=trader-alpha`, `AGENT_NAME=staker-beta`, `AGENT_NAME=monitor-gamma`
- Agents can transfer SOL between each other using the `TRANSFER` intent.

### Agent Communication via On-Chain Memo
- Agents can leave verifiable messages for each other using the SPL Memo program.
- Example: Agent A writes "TASK_COMPLETE:swap:tx_sig" on-chain, Agent B reads it.
- See `EXECUTION_PRESETS.md` Preset 4 for the Memo payload blueprint.

---

## Observability & Logging

### Audit Log Format

Every intent execution is logged to `.agent_wallets/audit_log.json`:

```json
{
  "entries": [
    {
      "agentName": "Nexus-Prime",
      "timestamp": "2026-02-25T19:53:28.000Z",
      "intentType": "TRANSFER",
      "status": "SUCCESS",
      "result": "5x9Y2v...txSig",
      "metadata": {
        "target": "E5kh3gws...",
        "amount": 0.05,
        "hasTransaction": false,
        "instructionsCount": 1
      }
    }
  ]
}
```

### CLI Output Levels

| Level | Logger Method | When Used |
|-------|--------------|-----------|
| INFO | `logger.info()` | General operational messages |
| SUCCESS | `logger.success()` | Confirmed successful operations |
| WARN | `logger.warn()` | Rate limits, Devnet constraints, non-critical |
| ERROR | `logger.error()` | Failed operations, RPC errors |
| AGENT | `logger.agent()` | Agent-specific intent routing messages |

---

## Performance Optimization

### Transaction Confirmation Strategies

| Strategy | Speed | Reliability | Use Case |
|----------|-------|------------|----------|
| `processed` | Fastest | Lowest | Quick reads, balance checks |
| `confirmed` | Medium | High | Standard transactions |
| `finalized` | Slowest | Highest | Critical transfers, large amounts |

### Reducing RPC Calls

1. **Cache blockhashes**: Reuse blockhash for up to 60 seconds (150 slots).
2. **Batch token queries**: Use `getParsedTokenAccountsByOwner` instead of querying each ATA individually.
3. **Use WebSocket subscriptions** for monitoring instead of polling:
```typescript
connection.onAccountChange(walletPublicKey, (accountInfo) => {
    const newBalance = accountInfo.lamports / 1e9;
    console.log(`Balance changed: ${newBalance} SOL`);
});
```

---

## Glossary

| Term | Definition |
|------|-----------|
| **ATA** | Associated Token Account — deterministically derived account for holding SPL tokens |
| **ALT** | Address Lookup Table — reduces transaction size by referencing accounts by index |
| **BPS** | Basis Points — 1 BPS = 0.01%. Used for slippage (50 BPS = 0.5%) |
| **CU** | Compute Units — Solana's measure of computational cost per transaction |
| **Intent** | A typed action request (`FUND`, `TRANSFER`, `DEFI_EXECUTION`) |
| **Lamports** | Smallest SOL unit. 1 SOL = 1,000,000,000 lamports |
| **PDA** | Program Derived Address — deterministic address owned by a program |
| **Rent** | SOL locked in an account to keep it alive (~0.00203928 SOL per account) |
| **v0** | VersionedTransaction message format supporting Address Lookup Tables |
| **Vault** | The `AgenticWallet` boundary that protects the private key |
| **AgentBrain** | Rule-based decision engine that drives autonomous agent behavior |
| **AgentState** | Persistent state container tracking balance, tokens, cycles |

---

## AgentBrain — Autonomous Decision Engine

The `AgentBrain` is the autonomous decision-making layer that turns a wallet into an agent. It runs a Perceive → Evaluate → Act cycle.

### How It Works

```typescript
import { AIAgent } from './core/AIAgent';
import { AgentBrain } from './agent/AgentBrain';

const agent = new AIAgent('Alpha-Trader');
const brain = new AgentBrain(agent);

// Add custom rules
brain.addRule({
    label: 'DEFI_ROUTE_VALIDATION',
    priority: 5,
    condition: (state) => state.solBalance >= 0.005,
    action: 'DEFI_EXECUTION',
    buildOptions: (state) => ({ transaction: myPayload }),
});

// Run a single decision cycle
const plan = await brain.runCycle();
// plan = { ruleFired: 'DEFI_ROUTE_VALIDATION', action: 'DEFI_EXECUTION', options: {...} }
```

### Default Rules

| Rule | Priority | Condition | Action |
|------|----------|-----------|--------|
| `FUND_IF_LOW` | 1 | SOL balance < 0.005 | `FUND` |
| `ATTEST_CYCLE` | 10 | SOL balance >= 0.005 | `DEFI_EXECUTION` |

### AgentState

The `AgentState` interface tracks persistent state across decision cycles:

```typescript
interface AgentState {
    name: string;
    publicKey: string;
    solBalance: number;
    tokenBalances: Map<string, number>;
    lastActionTimestamp: number;
    lastAction: string;
    cyclesCompleted: number;
}
```

---

## SplTokenService — SPL Token Operations

The `SplTokenService` provides programmatic token operations:

```typescript
import { SplTokenService } from './services/SplTokenService';

const tokenService = new SplTokenService();

// Create a new token mint
const mint = await tokenService.createTokenMint(payerKeypair, 9);

// Get or create an Associated Token Account
const ata = await tokenService.getOrCreateAta(payerKeypair, mint, ownerPublicKey);

// Mint tokens
await tokenService.mintTokens(payerKeypair, mint, ata.address, 1000);

// Transfer tokens
await tokenService.transferTokens(payerKeypair, sourceAta, destAta, ownerKeypair, 50);

// Check balance
const balance = await tokenService.getTokenBalance(ata.address);
```

### Available Methods

| Method | Purpose |
|--------|---------|
| `createTokenMint(payer, decimals)` | Create a new SPL token mint |
| `getOrCreateAta(payer, mint, owner)` | Get or create an Associated Token Account |
| `mintTokens(payer, mint, dest, amount)` | Mint tokens to an ATA |
| `transferTokens(payer, source, dest, owner, amount)` | Transfer SPL tokens between ATAs |
| `getTokenBalance(ataAddress)` | Query token balance for an ATA |

---

> **Design Note:** For advanced execution blueprints (Jupiter API, Staking, SPL operations, Priority Fees, Account Cleanup, Raydium, Orca), always consult `EXECUTION_PRESETS.md`.


