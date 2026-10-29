import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

export interface AwarenessEntry {
  clientId: number;
  clock: number;
  /** JSON string; 'null' means the client went away. */
  state: string;
}

/**
 * The server never instantiates y-protocols' Awareness: its internal setInterval would keep the Durable
 * Object from hibernating. Instead we parse/encode the wire format directly and just relay it.
 */
export function decodeAwarenessUpdate(update: Uint8Array): AwarenessEntry[] {
  const d = decoding.createDecoder(update);
  const n = decoding.readVarUint(d);
  const out: AwarenessEntry[] = [];
  for (let i = 0; i < n; i++) {
    const clientId = decoding.readVarUint(d);
    const clock = decoding.readVarUint(d);
    const state = decoding.readVarString(d);
    out.push({ clientId, clock, state });
  }
  return out;
}

export function encodeAwarenessUpdate(entries: readonly AwarenessEntry[]): Uint8Array {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, entries.length);
  for (const { clientId, clock, state } of entries) {
    encoding.writeVarUint(e, clientId);
    encoding.writeVarUint(e, clock);
    encoding.writeVarString(e, state);
  }
  return encoding.toUint8Array(e);
}
