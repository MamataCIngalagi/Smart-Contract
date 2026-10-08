import { BrowserProvider, isAddress } from "ethers";

export const VAULT_ABI = [
  "function storeMessage(string encryptedMsg, uint256 unlockTime)",
  "function readMessage() view returns (string)",
  "function updateMessage(string newMsg, uint256 newUnlockTime)",
  "function deleteMessage()",
  "function getUnlockTime() view returns (uint256)",
];

export type VaultConfig = {
  contractAddress: string;
  chainId: string;
};

const KEY_ITERATIONS = 310_000;
const LOCAL_CONFIG_KEY = "timelock-vault-config-v1";

export function loadVaultConfig(): VaultConfig {
  try {
    const stored = window.localStorage.getItem(LOCAL_CONFIG_KEY);
    if (!stored) return { contractAddress: "", chainId: "" };
    const parsed = JSON.parse(stored) as Partial<VaultConfig>;
    return {
      contractAddress: typeof parsed.contractAddress === "string" ? parsed.contractAddress : "",
      chainId: typeof parsed.chainId === "string" ? parsed.chainId : "",
    };
  } catch {
    return { contractAddress: "", chainId: "" };
  }
}

export function saveVaultConfig(config: VaultConfig): void {
  window.localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(config));
}

export function getWalletProvider(): BrowserProvider | null {
  if (!window.ethereum) return null;
  return new BrowserProvider(window.ethereum as ConstructorParameters<typeof BrowserProvider>[0]);
}

export function addressIsValid(address: string): boolean {
  return isAddress(address.trim());
}

export function networkName(chainId: number | null): string {
  if (chainId === null) return "Network not detected";
  const names: Record<number, string> = {
    1: "Ethereum",
    10: "Optimism",
    137: "Polygon",
    8453: "Base",
    42161: "Arbitrum One",
    11155111: "Sepolia",
    80002: "Polygon Amoy",
    84532: "Base Sepolia",
    421614: "Arbitrum Sepolia",
    11155420: "OP Sepolia",
    31337: "Local chain",
  };
  return names[chainId] ?? `Chain ${chainId}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveEncryptionKey(passphrase: string, salt: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KEY_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function encryptNote(plaintext: string, passphrase: string): Promise<string> {
  if (!window.crypto?.subtle) throw new Error("This browser does not support secure local encryption.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(passphrase, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );

  return `v1.${toBase64(salt)}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptNote(envelope: string, passphrase: string): Promise<string> {
  if (!window.crypto?.subtle) throw new Error("This browser does not support secure local decryption.");
  const [version, encodedSalt, encodedIv, encodedCiphertext] = envelope.split(".");
  if (version !== "v1" || !encodedSalt || !encodedIv || !encodedCiphertext) {
    throw new Error("This vault entry has an unsupported encrypted format.");
  }

  try {
    const salt = fromBase64(encodedSalt);
    const iv = fromBase64(encodedIv);
    const ciphertext = fromBase64(encodedCiphertext);
    const key = await deriveEncryptionKey(passphrase, salt, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("That passphrase did not unlock this message. Check it and try again.");
  }
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    for (const key of ["shortMessage", "reason", "message"]) {
      if (typeof value[key] === "string" && value[key]) return value[key] as string;
    }
    if (value.error) return errorMessage(value.error);
  }
  return "The wallet or contract could not complete that request.";
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (payload: unknown) => void) => void;
      removeListener?: (event: string, handler: (payload: unknown) => void) => void;
    };
  }
}
