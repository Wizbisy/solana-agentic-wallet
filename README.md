# Solana Agentic Wallet

A secure, intent driven infrastructure for autonomous AI agents executing on-chain operations on the Solana blockchain.

This project solves the **Prompt Injection Problem** ensuring that even if an LLM is compromised, it cannot extract private key material. The architecture enforces a strict **Vault & Orchestrator** model where all cryptographic signing is physically sandboxed from the agent's decision context.

## Key Features

- **AgentBrain**: Rule based autonomous decision engine. Agents perceive on-chain state, evaluate configurable rules, and execute actions without human input.
- **Zero Key Exposure**: The AI agent never touches `secretKey`. All signing happens inside the sandboxed `AgenticWallet`.
- **Intent-Based Execution**: Agents route typed intents (`FUND`, `TRANSFER`, `DEFI_EXECUTION`, `TOKEN_TRANSFER`) through the Strategy Pattern orchestrator.
- **SPL Token Support**: Create mints, manage Associated Token Accounts, mint and transfer SPL tokens programmatically.
- **Pre-flight Validation**: Every transaction is simulated via RPC before the keypair is engaged for signing.
- **VersionedTransaction Support**: Full `v0` message support for complex DeFi operations.
- **Multi-Agent Scalability**: Deploy multiple independent agents, each with their own keypair, balance, and audit trail.
- **Immutable Audit Trail**: Every intent execution is logged to `.agent_wallets/audit_log.json`.

## Architecture

```
AI Agent (LLM / Autonomous Logic)
  │
  ├── AgentBrain ──── Rule-based decision engine
  │     ├── AgentState ──── Persistent state (balance, tokens, cycles)
  │     └── Perceive → Evaluate Rules → Act → Verify
  │
  ├── AIAgent.ts ──── Public interface, intent invocation
  │
  ├── IntentOrchestrator ──── Strategy Pattern routing
  │     ├── FundIntent ──── Devnet airdrop
  │     ├── TransferIntent ──── SOL transfers
  │     ├── DefiIntent ──── Any Transaction / VersionedTransaction
  │     └── TokenTransfer ──── SPL token operations
  │
  ├── AgenticWallet ──── VAULT BOUNDARY (signing + simulation)
  │     ├── KeyManager ──── Keypair isolation (zero LLM access)
  │     └── TransactionValidator ──── Payload validation
  │
  ├── SplTokenService ──── Mint, ATA, transfer, balance
  │
  └── RpcService ──── Network abstraction + dispatch
```

## Project Structure

```
src/
├── agent/
│   ├── AgentBrain.ts           # Rule-based autonomous decision engine
│   └── AgentState.ts           # Persistent state tracking across cycles
├── config/
│   ├── constants.ts            # Static configuration constants
│   └── env.ts                  # Environment variable binding and defaults
├── core/
│   ├── AIAgent.ts              # Public agent interface (intent invocation)
│   └── AgenticWallet.ts        # Vault boundary (signing + simulation)
├── db/
│   └── AuditLogger.ts          # Immutable JSON audit trail
├── intents/
│   ├── IntentOrchestrator.ts   # Strategy Pattern intent router
│   ├── types.ts                # Intent type definitions and interfaces
│   └── handlers/
│       ├── DefiIntent.ts       # Arbitrary Transaction / VersionedTransaction handler
│       ├── FundIntent.ts       # Devnet airdrop handler
│       └── TransferIntent.ts   # SOL transfer handler
├── security/
│   ├── KeyManager.ts           # Keypair loader/generator (sandboxed)
│   └── TransactionValidator.ts # Payload bounds checking
├── services/
│   ├── RpcService.ts           # Network abstraction, simulation, dispatch
│   └── SplTokenService.ts      # SPL token mint, ATA, transfer, balance
├── utils/
│   ├── errors.ts               # Custom error classes
│   └── logger.ts               # Formatted CLI logging utility
├── index.ts                    # Single-agent entry point
└── multi-agent-demo.ts         # Multi-agent fleet demonstration
```

## Quickstart

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Optional)

Create a `.env` file. Defaults to Devnet if omitted.

```env
SOLANA_RPC_URL=https://api.devnet.solana.com
AGENT_NAME=Nexus-Prime
```

### 3. Run Single Agent

```bash
npm start
```

Initializes the KeyManager, funds the wallet, executes a transfer with pre flight validation, and logs all outcomes to the audit trail.

### 4. Run Multi-Agent Fleet

```bash
npm run agent:multi
```

Deploys three independent agents (`Alpha-Trader`, `Beta-Sentinel`, `Gamma-Auditor`) using the **Commander funding model**:

1. All agent wallets are created programmatically
2. If no agents are funded, attempts an airdrop, if that fails, **opens the browser** to the [Solana Faucet](https://faucet.solana.com) with the address pre filled
3. After funding, the Commander distributes SOL to unfunded peers via `TRANSFER`
4. Each agent runs its own `AgentBrain` decision loop
5. Rules evaluated: `FUND_IF_LOW`, `DEFI_ROUTE_VALIDATION`, `DISTRIBUTE_SOL`, `WRITE_ATTESTATION`
6. All actions logged to the audit trail

**First run:** The browser will open to the faucet automatically. Fund the first agent, press Enter, and the Commander handles the rest.

## Documentation

| Document | Purpose |
|----------|---------|
| [SKILLS.md](SKILLS.md) | Agent integration, guide phases, triggers, security boundaries, and extension patterns |
| [EXECUTION_PRESETS.md](EXECUTION_PRESETS.md) | Execution blueprints for Jupiter, Raydium, Orca, Marinade, SPL tokens, and more |

## Tech Stack

- **Runtime**: TypeScript / Node.js
- **Blockchain**: `@solana/web3.js`, `@solana/spl-token`
- **Agent Logic**: Custom `AgentBrain` with configurable rule engine
- **Security**: Sandboxed `KeyManager` with file based keypair storage
- **Logging**: Structured CLI output via `chalk` + JSON audit trail

## License

MIT
