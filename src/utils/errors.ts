export class AgentError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'AgentError';
    }
}

export class SecurityError extends AgentError {
    constructor(message: string) {
        super(message, 'SECURITY_VIOLATION');
    }
}

export class ConfigurationError extends AgentError {
    constructor(message: string) {
        super(message, 'CONFIG_ERROR');
    }
}

export class NetworkError extends AgentError {
    constructor(message: string) {
        super(message, 'NETWORK_ERROR');
    }
}
