import { PublicKey } from '@solana/web3.js';

/**
  Persistent state container for an autonomous agent.
  Tracks on-chain state, token holdings, and execution history
  so the AgentBrain can make informed decisions across cycles.
**/ 
export interface AgentState {
    name: string;
    publicKey: string;
    solBalance: number;
    tokenBalances: Map<string, number>;
    lastActionTimestamp: number;
    lastAction: string;
    cyclesCompleted: number;
}

/**
  Create a fresh initial state for a new agent.
**/ 
export function createInitialState(name: string, publicKey: PublicKey): AgentState {
    return {
        name,
        publicKey: publicKey.toBase58(),
        solBalance: 0,
        tokenBalances: new Map(),
        lastActionTimestamp: 0,
        lastAction: 'NONE',
        cyclesCompleted: 0,
    };
}
