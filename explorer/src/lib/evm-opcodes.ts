/**
 * EVM opcode table.
 * -----------------
 * Covers the canonical opcodes up to and including the Cancun-Prague set,
 * which is what Hyperledger Besu currently exposes for WINTG.
 *
 * Each entry maps a byte (0x00–0xFF) to a human name and the number of
 * inline data bytes that follow (only PUSH1..PUSH32 has a non-zero value).
 */

export interface OpcodeEntry {
  name: string;
  /** Number of inline bytes following the opcode (PUSHN). 0 for everything else. */
  push: number;
}

export const OPCODES: Record<number, OpcodeEntry> = {
  // Stop & arithmetic
  0x00: { name: "STOP",          push: 0 },
  0x01: { name: "ADD",           push: 0 },
  0x02: { name: "MUL",           push: 0 },
  0x03: { name: "SUB",           push: 0 },
  0x04: { name: "DIV",           push: 0 },
  0x05: { name: "SDIV",          push: 0 },
  0x06: { name: "MOD",           push: 0 },
  0x07: { name: "SMOD",          push: 0 },
  0x08: { name: "ADDMOD",        push: 0 },
  0x09: { name: "MULMOD",        push: 0 },
  0x0a: { name: "EXP",           push: 0 },
  0x0b: { name: "SIGNEXTEND",    push: 0 },

  // Comparison & bitwise
  0x10: { name: "LT",            push: 0 },
  0x11: { name: "GT",            push: 0 },
  0x12: { name: "SLT",           push: 0 },
  0x13: { name: "SGT",           push: 0 },
  0x14: { name: "EQ",            push: 0 },
  0x15: { name: "ISZERO",        push: 0 },
  0x16: { name: "AND",           push: 0 },
  0x17: { name: "OR",            push: 0 },
  0x18: { name: "XOR",           push: 0 },
  0x19: { name: "NOT",           push: 0 },
  0x1a: { name: "BYTE",          push: 0 },
  0x1b: { name: "SHL",           push: 0 },
  0x1c: { name: "SHR",           push: 0 },
  0x1d: { name: "SAR",           push: 0 },

  // SHA3
  0x20: { name: "KECCAK256",     push: 0 },

  // Environment
  0x30: { name: "ADDRESS",       push: 0 },
  0x31: { name: "BALANCE",       push: 0 },
  0x32: { name: "ORIGIN",        push: 0 },
  0x33: { name: "CALLER",        push: 0 },
  0x34: { name: "CALLVALUE",     push: 0 },
  0x35: { name: "CALLDATALOAD",  push: 0 },
  0x36: { name: "CALLDATASIZE",  push: 0 },
  0x37: { name: "CALLDATACOPY",  push: 0 },
  0x38: { name: "CODESIZE",      push: 0 },
  0x39: { name: "CODECOPY",      push: 0 },
  0x3a: { name: "GASPRICE",      push: 0 },
  0x3b: { name: "EXTCODESIZE",   push: 0 },
  0x3c: { name: "EXTCODECOPY",   push: 0 },
  0x3d: { name: "RETURNDATASIZE",push: 0 },
  0x3e: { name: "RETURNDATACOPY",push: 0 },
  0x3f: { name: "EXTCODEHASH",   push: 0 },

  // Block
  0x40: { name: "BLOCKHASH",     push: 0 },
  0x41: { name: "COINBASE",      push: 0 },
  0x42: { name: "TIMESTAMP",     push: 0 },
  0x43: { name: "NUMBER",        push: 0 },
  0x44: { name: "PREVRANDAO",    push: 0 },
  0x45: { name: "GASLIMIT",      push: 0 },
  0x46: { name: "CHAINID",       push: 0 },
  0x47: { name: "SELFBALANCE",   push: 0 },
  0x48: { name: "BASEFEE",       push: 0 },
  0x49: { name: "BLOBHASH",      push: 0 },
  0x4a: { name: "BLOBBASEFEE",   push: 0 },

  // Stack, mem, storage, flow
  0x50: { name: "POP",           push: 0 },
  0x51: { name: "MLOAD",         push: 0 },
  0x52: { name: "MSTORE",        push: 0 },
  0x53: { name: "MSTORE8",       push: 0 },
  0x54: { name: "SLOAD",         push: 0 },
  0x55: { name: "SSTORE",        push: 0 },
  0x56: { name: "JUMP",          push: 0 },
  0x57: { name: "JUMPI",         push: 0 },
  0x58: { name: "PC",            push: 0 },
  0x59: { name: "MSIZE",         push: 0 },
  0x5a: { name: "GAS",           push: 0 },
  0x5b: { name: "JUMPDEST",      push: 0 },
  0x5c: { name: "TLOAD",         push: 0 },
  0x5d: { name: "TSTORE",        push: 0 },
  0x5e: { name: "MCOPY",         push: 0 },
  0x5f: { name: "PUSH0",         push: 0 },

  // System
  0xf0: { name: "CREATE",        push: 0 },
  0xf1: { name: "CALL",          push: 0 },
  0xf2: { name: "CALLCODE",      push: 0 },
  0xf3: { name: "RETURN",        push: 0 },
  0xf4: { name: "DELEGATECALL",  push: 0 },
  0xf5: { name: "CREATE2",       push: 0 },
  0xfa: { name: "STATICCALL",    push: 0 },
  0xfd: { name: "REVERT",        push: 0 },
  0xfe: { name: "INVALID",       push: 0 },
  0xff: { name: "SELFDESTRUCT",  push: 0 },
};

// PUSH1..PUSH32 (0x60..0x7f)
for (let i = 1; i <= 32; i++) {
  OPCODES[0x5f + i] = { name: `PUSH${i}`, push: i };
}
// DUP1..DUP16 (0x80..0x8f)
for (let i = 1; i <= 16; i++) {
  OPCODES[0x7f + i] = { name: `DUP${i}`, push: 0 };
}
// SWAP1..SWAP16 (0x90..0x9f)
for (let i = 1; i <= 16; i++) {
  OPCODES[0x8f + i] = { name: `SWAP${i}`, push: 0 };
}
// LOG0..LOG4 (0xa0..0xa4)
for (let i = 0; i <= 4; i++) {
  OPCODES[0xa0 + i] = { name: `LOG${i}`, push: 0 };
}

export function lookupOpcode(byte: number): OpcodeEntry {
  return OPCODES[byte] ?? { name: `UNKNOWN_0x${byte.toString(16).padStart(2, "0")}`, push: 0 };
}

export interface DisassembledLine {
  /** Program counter (offset in bytes) */
  pc: number;
  byte: number;
  name: string;
  /** Hex of immediate bytes for PUSH; "" otherwise. */
  immediate: string;
}

/**
 * Disassemble a hex blob into EVM operations. Tolerates 0x prefix and
 * whitespace. Trailing PUSH bytes that overflow the input are emitted as
 * "TRUNCATED" lines so the user still sees something sensible.
 */
export function disassemble(input: string): DisassembledLine[] {
  let h = input.replace(/\s+/g, "");
  if (h.startsWith("0x") || h.startsWith("0X")) h = h.slice(2);
  if (h.length === 0) return [];
  if (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2 !== 0) {
    throw new Error("Invalid hex bytecode (must be an even-length 0x… string).");
  }

  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }

  const out: DisassembledLine[] = [];
  let pc = 0;
  while (pc < bytes.length) {
    const b = bytes[pc];
    const op = lookupOpcode(b);
    let immediate = "";
    if (op.push > 0) {
      const start = pc + 1;
      const end = Math.min(start + op.push, bytes.length);
      const slice = bytes.slice(start, end);
      immediate = "0x" + Array.from(slice).map((x) => x.toString(16).padStart(2, "0")).join("");
      if (end - start < op.push) {
        out.push({ pc, byte: b, name: op.name + " (TRUNCATED)", immediate });
        break;
      }
    }
    out.push({ pc, byte: b, name: op.name, immediate });
    pc += 1 + op.push;
  }
  return out;
}
