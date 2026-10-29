/**
 * Board WebSocket protocol. Each binary frame holds one or more messages, each prefixed with a varUint
 * type. Sync and awareness payloads are standard y-protocols encodings.
 */
export const MSG_SYNC = 0;
export const MSG_AWARENESS = 1;
/** Server -> client: the connection's role (varString). */
export const MSG_ROLE = 3;

/** Client batches outgoing doc/awareness updates into one frame per interval (~20 frames/s max). */
export const SYNC_BATCH_MS = 50;

/**
 * Text-frame heartbeat. The Durable Object answers via setWebSocketAutoResponse, which replies without
 * waking a hibernated object.
 */
export const HEARTBEAT_PING = 'ping';
export const HEARTBEAT_PONG = 'pong';

/** WebSocket close codes used by the server. */
export const CLOSE_ACCESS_REVOKED = 4003;
export const CLOSE_BOARD_DELETED = 4004;
