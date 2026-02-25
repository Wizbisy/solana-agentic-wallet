# Solana AI Agent Wallet

A secure, intent-driven infrastructure for autonomous AI agents executing on-chain operations on the Solana blockchain.

This project solves the **Prompt Injection Problem** — ensuring that even if an LLM is compromised, it cannot extract private key material. The architecture enforces a strict **Vault & Orchestrator** model where all cryptographic signing is physically sandboxed from the agent's decision context.

## Key Features

- **Zero Key Exposure** — The AI agent never touches `secretKey`. All signing happens inside the sandboxed `AgenticWallet`.
- **Intent-Based Execution** — Agents route typed intents (`FUND`, `TRANSFER`, `DEFI_EXECUTION`) through the Strategy Pattern orchestrator.
- **Pre-flight Validation** — Every transaction is simulated via RPC before the keypair is engaged for signing.
- **VersionedTransaction Support** — Full `v0` message support with Address Lookup Tables for complex DeFi operations.
- **Multi-Agent Scalability** — Spin up multiple independent agents, each with their own isolated keypair, balance, and audit trail.
- **Immutable Audit Trail** — Every intent execution (success or failure) is logged to `.agent_wallets/audit_log.json`.
- **Network Agnostic** — Devnet and Mainnet support via environment configuration.

## Architecture

```
AI Agent (LLM Context)
  │
  ├── AIAgent.ts ──── Public interface, intent invocation
  │
  ├── IntentOrchestrator ──── Strategy Pattern routing
  │     ├── FundIntent ──── Devnet airdrop + faucet fallback
  │     ├── TransferIntent ──── SOL transfers
  │     └── DefiIntent ──── Any Transaction / VersionedTransaction
  │
  ├── AgenticWallet ──── VAULT BOUNDARY (signing + simulation)
  │     ├── KeyManager ──── Keypair isolation (zero LLM access)
  │     └── TransactionValidator ──── Payload bounds checking
  │
  └── RpcService ──── Network abstraction + dispatch
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

The orchestrator will initialize the KeyManager, fund the wallet via Devnet airdrop, execute a transfer with pre-flight validation, and log all outcomes to the audit trail.

### 4. Run Multi-Agent Fleet
```bash
npm run agent:multi
```

Spins up three independent agents (`Alpha-Trader`, `Beta-Sentinel`, `Gamma-Auditor`), each with their own isolated keypair and role-specific intents. Demonstrates concurrent autonomous execution at scale.

## Documentation

| Document | Purpose |
|----------|---------|
| [SKILLS.md](SKILLS.md) | Agent integration guide — phases, triggers, security boundaries, and extension patterns |
| [EXECUTION_PRESETS.md](EXECUTION_PRESETS.md) | Copy-paste execution blueprints for Jupiter, Raydium, Orca, Marinade, SPL tokens, and more |

## Tech Stack

- **Runtime**: TypeScript / Node.js
- **Blockchain**: `@solana/web3.js`
- **Security**: Sandboxed `KeyManager` with file-based keypair storage
- **Logging**: Structured CLI output via `chalk` + JSON audit trail

## License

MIT
