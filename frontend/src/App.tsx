import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Contract } from "ethers";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  Check,
  Clock3,
  Copy,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Network,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  UnlockKeyhole,
  Wallet,
  X,
} from "lucide-react";
import {
  addressIsValid,
  decryptNote,
  encryptNote,
  errorMessage,
  getWalletProvider,
  loadVaultConfig,
  networkName,
  saveVaultConfig,
  VAULT_ABI,
  type VaultConfig,
} from "./vault";

type LoadState = "loading" | "needs-config" | "needs-wallet" | "wrong-network" | "empty" | "stored" | "error";
type Notice = { tone: "success" | "error" | "pending"; text: string };

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formattedDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function countdown(timestamp: number, now: number): string {
  let seconds = Math.max(0, Math.floor(timestamp - now / 1000));
  const days = Math.floor(seconds / 86_400);
  seconds %= 86_400;
  const hours = Math.floor(seconds / 3_600);
  seconds %= 3_600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(hours).padStart(2, "0")} : ${String(minutes).padStart(2, "0")} : ${String(seconds).padStart(2, "0")}`;
}

function initialUnlockTime(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
  return tomorrow.toISOString().slice(0, 16);
}

function GateCard({
  icon,
  label,
  title,
  copy,
  action,
  onAction,
  busy = false,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  copy: string;
  action: string;
  onAction: () => void;
  busy?: boolean;
}) {
  return (
    <section className="gate-card">
      <div className="gate-icon">{icon}</div>
      <p className="micro-label">{label}</p>
      <h2>{title}</h2>
      <p className="gate-copy">{copy}</p>
      <button className="button button-primary" type="button" onClick={onAction} disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={17} /> : null}
        {action}
        {!busy ? <ArrowRight size={17} /> : null}
      </button>
    </section>
  );
}

export default function App() {
  const [config, setConfig] = useState<VaultConfig>(() => loadVaultConfig());
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [unlockTime, setUnlockTime] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState(config.contractAddress);
  const [chainDraft, setChainDraft] = useState(config.chainId);
  const [settingsError, setSettingsError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [message, setMessage] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [unlockPassphrase, setUnlockPassphrase] = useState("");
  const [unlockInput, setUnlockInput] = useState(initialUnlockTime);
  const [revealedMessage, setRevealedMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [walletAvailable, setWalletAvailable] = useState(false);

  const contractConfigured = Boolean(config.contractAddress && config.chainId);
  const isUnlocked = unlockTime !== null && now >= unlockTime * 1000;
  const connectedNetwork = useMemo(() => networkName(chainId), [chainId]);

  useEffect(() => {
    setWalletAvailable(Boolean(window.ethereum));
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const injected = window.ethereum;
    if (!injected?.on) return;

    const onAccountsChanged = (value: unknown) => {
      const next = Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
      setAccount(next);
      setRevealedMessage(null);
      setUnlockPassphrase("");
    };
    const onChainChanged = (value: unknown) => {
      try {
        setChainId(Number(BigInt(String(value))));
      } catch {
        setChainId(null);
      }
      setRevealedMessage(null);
    };

    injected.on("accountsChanged", onAccountsChanged);
    injected.on("chainChanged", onChainChanged);
    return () => {
      injected.removeListener?.("accountsChanged", onAccountsChanged);
      injected.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  const refreshVault = useCallback(async () => {
    setLoadError("");
    setUnlockTime(null);

    if (!contractConfigured || !addressIsValid(config.contractAddress) || !Number(config.chainId)) {
      setLoadState("needs-config");
      return;
    }
    if (!account) {
      setLoadState("needs-wallet");
      return;
    }

    const provider = getWalletProvider();
    if (!provider) {
      setLoadState("needs-wallet");
      return;
    }

    setLoadState("loading");
    try {
      const network = await provider.getNetwork();
      const activeChain = Number(network.chainId);
      setChainId(activeChain);
      if (activeChain !== Number(config.chainId)) {
        setLoadState("wrong-network");
        return;
      }

      const bytecode = await provider.getCode(config.contractAddress);
      if (bytecode === "0x") {
        throw new Error("No contract is deployed at this address on the connected network.");
      }

      const signer = await provider.getSigner(account);
      const contract = new Contract(config.contractAddress, VAULT_ABI, signer);
      try {
        const rawUnlockTime = await contract.getUnlockTime();
        const nextUnlockTime = Number(rawUnlockTime);
        if (!Number.isSafeInteger(nextUnlockTime) || nextUnlockTime <= 0) {
          throw new Error("The contract returned an invalid unlock time.");
        }
        setUnlockTime(nextUnlockTime);
        setLoadState("stored");
      } catch (error) {
        const reason = errorMessage(error);
        if (/no stored message|no message stored/i.test(reason)) {
          setUnlockTime(null);
          setLoadState("empty");
        } else {
          throw error;
        }
      }
    } catch (error) {
      setLoadError(errorMessage(error));
      setLoadState("error");
    }
  }, [account, config.chainId, config.contractAddress, contractConfigured]);

  useEffect(() => {
    void refreshVault();
  }, [refreshVault]);

  function openSettings() {
    setAddressDraft(config.contractAddress);
    setChainDraft(config.chainId || (chainId ? String(chainId) : ""));
    setSettingsError("");
    setSettingsOpen(true);
  }

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = addressDraft.trim();
    const parsedChainId = Number(chainDraft);
    if (!addressIsValid(address)) {
      setSettingsError("Enter a valid EVM contract address.");
      return;
    }
    if (!Number.isSafeInteger(parsedChainId) || parsedChainId <= 0) {
      setSettingsError("Enter the positive chain ID where this contract is deployed.");
      return;
    }

    const nextConfig = { contractAddress: address, chainId: String(parsedChainId) };
    try {
      saveVaultConfig(nextConfig);
    } catch {
      setSettingsError("This browser blocked local storage. Allow site storage to save the connection settings.");
      return;
    }
    setConfig(nextConfig);
    setSettingsOpen(false);
    setRevealedMessage(null);
    setNotice({ tone: "success", text: "Contract settings saved on this device." });
  }

  async function connectWallet() {
    setNotice(null);
    if (!window.ethereum) {
      setNotice({ tone: "error", text: "No browser wallet was detected. Open this page in a browser with an EVM wallet installed." });
      return;
    }
    setBusy(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
        throw new Error("The wallet did not return an account.");
      }
      const provider = getWalletProvider();
      if (!provider) throw new Error("The browser wallet could not be opened.");
      const network = await provider.getNetwork();
      setAccount(accounts[0]);
      setChainId(Number(network.chainId));
      setNotice({ tone: "success", text: "Wallet connected. Message text stays in this browser until encrypted." });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function switchNetwork() {
    if (!window.ethereum || !config.chainId) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${Number(config.chainId).toString(16)}` }],
      });
      setNotice({ tone: "success", text: "Network changed. Checking the contract again…" });
      await refreshVault();
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    }
  }

  async function configuredContract() {
    if (!account || !addressIsValid(config.contractAddress) || !config.chainId) {
      throw new Error("Configure the contract and connect a wallet first.");
    }
    const provider = getWalletProvider();
    if (!provider) throw new Error("Reconnect your browser wallet and try again.");
    const network = await provider.getNetwork();
    if (network.chainId !== BigInt(config.chainId)) {
      throw new Error("Your wallet network changed. Switch to the configured contract network and refresh the vault.");
    }
    if (await provider.getCode(config.contractAddress) === "0x") {
      throw new Error("No contract is deployed at this address on the selected network.");
    }
    const signer = await provider.getSigner(account);
    return new Contract(config.contractAddress, VAULT_ABI, signer);
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (!account || !contractConfigured || !message.trim()) return;
    if (passphrase.length < 8) {
      setNotice({ tone: "error", text: "Use an encryption passphrase of at least 8 characters." });
      return;
    }
    const targetTime = new Date(unlockInput).getTime();
    if (!Number.isFinite(targetTime) || targetTime <= Date.now()) {
      setNotice({ tone: "error", text: "Choose an unlock time in the future." });
      return;
    }

    setBusy(true);
    try {
      const encrypted = await encryptNote(message.trim(), passphrase);
      const contract = await configuredContract();
      const unixUnlockTime = BigInt(Math.floor(targetTime / 1_000));
      const transaction = loadState === "stored"
        ? await contract.updateMessage(encrypted, unixUnlockTime)
        : await contract.storeMessage(encrypted, unixUnlockTime);
      setNotice({ tone: "pending", text: "Transaction submitted. Waiting for the network to confirm…" });
      await transaction.wait();
      setMessage("");
      setPassphrase("");
      setRevealedMessage(null);
      setUnlockPassphrase("");
      setUnlockInput(initialUnlockTime());
      setNotice({ tone: "success", text: "Encrypted message saved to the vault." });
      await refreshVault();
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function revealMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (!account || !unlockTime || !isUnlocked) return;
    if (!unlockPassphrase) {
      setNotice({ tone: "error", text: "Enter the passphrase used when this message was encrypted." });
      return;
    }

    setBusy(true);
    try {
      const contract = await configuredContract();
      const encrypted = await contract.readMessage() as string;
      const plaintext = await decryptNote(encrypted, unlockPassphrase);
      setRevealedMessage(plaintext);
      setNotice({ tone: "success", text: "Message decrypted locally. It has not been sent to a server." });
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function deleteMessage() {
    if (!account || !window.confirm("Delete your encrypted message from the vault? This transaction cannot be undone.")) return;
    setBusy(true);
    setNotice(null);
    try {
      const contract = await configuredContract();
      const transaction = await contract.deleteMessage();
      setNotice({ tone: "pending", text: "Delete transaction submitted. Waiting for confirmation…" });
      await transaction.wait();
      setUnlockTime(null);
      setRevealedMessage(null);
      setNotice({ tone: "success", text: "The contract cleared your message." });
      await refreshVault();
    } catch (error) {
      setNotice({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function copyAccount() {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      setNotice({ tone: "success", text: "Wallet address copied." });
    } catch {
      setNotice({ tone: "error", text: "Clipboard access is not available in this browser." });
    }
  }

  const canEdit = Boolean(account && contractConfigured && (loadState === "empty" || loadState === "stored"));
  const needsConfiguration = !contractConfigured || loadState === "needs-config";
  const isStored = loadState === "stored" && unlockTime !== null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="TimeLock vault home">
          <span className="brand-mark" aria-hidden="true"><Clock3 size={18} strokeWidth={1.8} /></span>
          <span className="brand-copy"><strong>TIMELOCK</strong><small>MESSAGE VAULT</small></span>
        </a>

        <div className="topbar-actions">
          <div className="network-pill" title={chainId ? `Connected chain ID ${chainId}` : "Connect a wallet to detect the network"}>
            <span className={`network-dot ${account ? "is-live" : ""}`} />
            <Network size={15} />
            <span>{account ? connectedNetwork : "EVM network"}</span>
          </div>
          <button className="icon-button settings-button" type="button" onClick={openSettings} aria-label="Configure contract" title="Configure contract">
            <Settings2 size={18} />
          </button>
          {account ? (
            <button className="wallet-connected" type="button" onClick={() => void copyAccount()} title="Copy wallet address">
              <span className="wallet-live-dot" />
              <span>{shortAddress(account)}</span>
              <Copy size={14} />
            </button>
          ) : (
            <button className="button button-connect" type="button" onClick={() => void connectWallet()} disabled={busy}>
              <Wallet size={16} />
              <span>{walletAvailable ? "Connect wallet" : "Wallet needed"}</span>
            </button>
          )}
        </div>
      </header>

      <main className="workspace-main">
        <div className="page-kicker"><span className="kicker-line" /> PERSONAL VAULT <span className="kicker-separator">/</span> SELF-CUSTODY</div>
        <section className="workspace-heading">
          <div>
            <h1>A message with a future.</h1>
            <p>Encrypt a note here. Your wallet and contract keep the key, the clock, and the ciphertext in your hands.</p>
          </div>
          <div className="heading-seal" aria-label="Locally encrypted, on-chain timelock">
            <Fingerprint size={20} />
            <span>LOCAL<br />ENCRYPTION</span>
          </div>
        </section>

        {notice ? (
          <div className={`notice notice-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
            {notice.tone === "error" ? <AlertCircle size={17} /> : notice.tone === "success" ? <Check size={17} /> : <LoaderCircle className="spin" size={17} />}
            <span>{notice.text}</span>
            <button className="notice-close" type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={15} /></button>
          </div>
        ) : null}

        <div className="vault-grid">
          <section className="editor-card">
            <div className="section-topline">
              <span className="micro-label">01 <span className="muted-slash">/</span> YOUR NOTE</span>
              <span className="on-device-tag"><span /> NEVER LEAVES THIS DEVICE UNENCRYPTED</span>
            </div>
            <div className="editor-heading">
              <div>
                <h2>{isStored ? "Replace or reschedule" : "Prepare a message"}</h2>
                <p>{isStored ? "The original stays hidden until it unlocks. A replacement resets its timer." : "Write once. Choose the moment it can be read."}</p>
              </div>
              <span className="step-index">01</span>
            </div>

            {needsConfiguration ? (
              <GateCard
                icon={<Network size={21} />}
                label="ONE-TIME SETUP"
                title="Point to your deployed contract"
                copy="The repository includes the Solidity source, but no deployed address. Add its EVM network and address to activate your vault."
                action="Configure contract"
                onAction={openSettings}
              />
            ) : loadState === "needs-wallet" ? (
              <GateCard
                icon={<Wallet size={21} />}
                label="YOUR ADDRESS IS YOUR ACCOUNT"
                title="Connect a browser wallet"
                copy="The contract reads and writes only the connected address's vault. The app never asks for or stores your wallet keys."
                action={walletAvailable ? "Connect wallet" : "Check for a wallet"}
                onAction={() => void connectWallet()}
                busy={busy}
              />
            ) : loadState === "wrong-network" ? (
              <GateCard
                icon={<Network size={21} />}
                label="NETWORK MISMATCH"
                title={`Switch to ${networkName(Number(config.chainId))}`}
                copy={`The configured contract is on chain ${config.chainId}. Your wallet is currently on ${connectedNetwork}. Switch networks to read this vault.`}
                action="Switch wallet network"
                onAction={() => void switchNetwork()}
              />
            ) : loadState === "error" ? (
              <GateCard
                icon={<AlertCircle size={21} />}
                label="CONTRACT CHECK FAILED"
                title="Could not read this vault"
                copy={loadError || "Check the wallet, network, and deployed contract address, then try again."}
                action="Check again"
                onAction={() => void refreshVault()}
              />
            ) : loadState === "loading" ? (
              <div className="loading-card"><LoaderCircle className="spin" size={22} /><span>Reading your vault from the connected network…</span></div>
            ) : (
              <>
                <form className="message-form" onSubmit={(event) => void submitMessage(event)}>
                  <label className="field-label" htmlFor="vault-note">MESSAGE <span>ENCRYPTED LOCALLY BEFORE SIGNING</span></label>
                  <textarea
                    id="vault-note"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder={isStored ? "Write a replacement message…" : "A note to your future self, a letter to open later…"}
                    maxLength={1200}
                    required
                    disabled={!canEdit || busy}
                  />
                  <div className="field-meta"><span>Up to 1,200 characters</span><span>{message.length} / 1,200</span></div>

                  <div className="field-row">
                    <label className="field-control" htmlFor="unlock-at">
                      <span className="field-label">UNLOCK AFTER</span>
                      <span className="input-with-icon"><Clock3 size={16} /><input id="unlock-at" type="datetime-local" value={unlockInput} onChange={(event) => setUnlockInput(event.target.value)} required disabled={!canEdit || busy} /></span>
                      <span className="field-hint">Your local time · the contract uses UTC</span>
                    </label>
                    <label className="field-control" htmlFor="encryption-passphrase">
                      <span className="field-label">ENCRYPTION PASSPHRASE</span>
                      <span className="input-with-icon"><KeyRound size={16} /><input id="encryption-passphrase" type="password" autoComplete="new-password" minLength={8} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} placeholder="At least 8 characters" required disabled={!canEdit || busy} /></span>
                      <span className="field-hint">Keep it safe; it is never stored.</span>
                    </label>
                  </div>

                  <div className="form-bottom">
                    <p className="gas-hint"><ArrowDownRight size={15} /> On-chain storage uses gas. Keep messages short.</p>
                    <button className="button button-primary submit-button" type="submit" disabled={!canEdit || busy || !message.trim()}>
                      {busy ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={16} />}
                      {busy ? "Waiting for wallet…" : isStored ? "Encrypt & update" : "Encrypt & store"}
                      {!busy ? <ArrowRight size={17} /> : null}
                    </button>
                  </div>
                </form>

          <div className="privacy-note">
                  <ShieldCheck size={18} />
            <p><strong>Encryption protects contents; the chain remains public.</strong> AES-GCM encryption runs in this browser. The configured contract requires a deployed TimeLockedVault at the selected network/address. Only ciphertext goes on-chain; keep your passphrase safe.</p>
                </div>

                {isStored && unlockTime ? (
                  <div className="stored-actions">
                    <span><LockKeyhole size={15} /> EXISTING CIPHERTEXT · {shortAddress(account ?? "")}</span>
                    <button className="button button-danger-quiet" type="button" onClick={() => void deleteMessage()} disabled={busy}><Trash2 size={15} /> Delete from vault</button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <aside className="status-column">
            <section className={`clock-card ${isStored ? (isUnlocked ? "clock-card-open" : "clock-card-locked") : ""}`}>
              <div className="clock-card-top">
                <span className="micro-label">02 <span className="muted-slash">/</span> LIVE STATUS</span>
                <button className="icon-button refresh-button" type="button" onClick={() => void refreshVault()} aria-label="Refresh vault status" title="Refresh vault status" disabled={loadState === "loading"}>
                  <RefreshCw size={16} className={loadState === "loading" ? "spin" : ""} />
                </button>
              </div>

              <div className="clock-face">
                <span className="clock-orbit clock-orbit-outer" />
                <span className="clock-orbit clock-orbit-inner" />
                <div className="clock-center">
                  {isStored ? (isUnlocked ? <UnlockKeyhole size={23} /> : <LockKeyhole size={23} />) : <Clock3 size={23} />}
                  <span>{isStored ? (isUnlocked ? "UNSEALED" : "TIME-LOCKED") : "TIME-LOCKED"}</span>
                </div>
                <span className="clock-marker marker-one" />
                <span className="clock-marker marker-two" />
                <span className="clock-marker marker-three" />
              </div>

              <div className="clock-copy" aria-live="polite">
                <p className="micro-label">{isStored && unlockTime ? (isUnlocked ? "AVAILABLE TO OPEN" : "TIME REMAINING") : "YOUR VAULT"}</p>
                <h2>{isStored && unlockTime ? (isUnlocked ? "Ready when you are." : countdown(unlockTime, now)) : loadState === "loading" ? "Checking…" : loadState === "empty" ? "Awaiting its first note." : "Connect to check status."}</h2>
                <p>{isStored && unlockTime ? (isUnlocked ? `Unlocked ${formattedDate(unlockTime)}. Only your wallet can read its own entry.` : `Opens ${formattedDate(unlockTime)}. Contract time, shown in your timezone.`) : "Connect your deployed contract to read the current on-chain state."}</p>
              </div>

              <div className="clock-divider" />
              <dl className="chain-details">
                <div><dt>NETWORK</dt><dd><span className="detail-dot" />{account ? connectedNetwork : (config.chainId ? networkName(Number(config.chainId)) : "Not connected")}</dd></div>
                <div><dt>CONTRACT</dt><dd className="monospace">{config.contractAddress ? shortAddress(config.contractAddress) : "Not configured"}</dd></div>
                <div><dt>UNLOCK TIME</dt><dd>{isStored && unlockTime ? formattedDate(unlockTime) : "—"}</dd></div>
              </dl>
            </section>

            {isStored && isUnlocked && unlockTime ? (
              <section className="reveal-card">
                <div className="reveal-heading"><span className="reveal-icon"><UnlockKeyhole size={17} /></span><div><p className="micro-label">THE WAIT IS OVER</p><h3>Open your message</h3></div></div>
                {revealedMessage !== null ? (
                  <div className="revealed-note">
                    <div className="revealed-note-top"><span>DECRYPTED ON THIS DEVICE</span><button className="text-button" type="button" onClick={() => setRevealedMessage(null)}>Hide</button></div>
                    <p>{revealedMessage}</p>
                  </div>
                ) : (
                  <form className="reveal-form" onSubmit={(event) => void revealMessage(event)}>
                    <label className="field-label" htmlFor="unlock-passphrase">YOUR ENCRYPTION PASSPHRASE</label>
                    <input id="unlock-passphrase" type="password" autoComplete="current-password" value={unlockPassphrase} onChange={(event) => setUnlockPassphrase(event.target.value)} placeholder="Enter the phrase you saved" required disabled={busy} />
                    <button className="button button-open" type="submit" disabled={busy}>
                      {busy ? <LoaderCircle className="spin" size={16} /> : <UnlockKeyhole size={16} />}
                      {busy ? "Opening…" : "Decrypt on this device"}
                    </button>
                  </form>
                )}
              </section>
            ) : null}

            <section className="principles-card">
              <div className="principle-icon"><Fingerprint size={18} /></div>
              <div><p className="micro-label">A NOTE ON PRIVACY</p><p>The contract enforces <strong>when</strong> your account can read. Browser encryption protects <strong>what</strong> it says. The encryption phrase is yours alone.</p></div>
            </section>
          </aside>
        </div>

        <footer className="app-footer">
          <span><span className="footer-mark" /> TIMELOCK <span className="footer-separator">·</span> YOUR WORDS, ON YOUR CLOCK</span>
          <span>Contract source is public; review before mainnet use. This app does not authenticate contract bytecode.</span>
        </footer>
      </main>

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-topline"><span className="micro-label">VAULT CONNECTION</span><button className="icon-button" type="button" onClick={() => setSettingsOpen(false)} aria-label="Close contract settings"><X size={18} /></button></div>
            <div className="modal-icon"><Network size={20} /></div>
            <h2 id="settings-title">Configure your contract</h2>
            <p className="modal-intro">Set the address where <code>TimeLockedVault</code> is deployed. This app does not deploy a contract or assume a network.</p>
            <form className="settings-form" onSubmit={saveSettings}>
              <label className="field-control" htmlFor="contract-address"><span className="field-label">DEPLOYED CONTRACT ADDRESS</span><input id="contract-address" value={addressDraft} onChange={(event) => setAddressDraft(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} required /></label>
              <label className="field-control" htmlFor="contract-chain"><span className="field-label">EVM CHAIN ID</span><input id="contract-chain" type="number" min="1" step="1" value={chainDraft} onChange={(event) => setChainDraft(event.target.value)} placeholder="For example: 11155111" required /><span className="field-hint">Use the same network selected in your wallet.</span></label>
              {settingsError ? <p className="settings-error" role="alert"><AlertCircle size={15} />{settingsError}</p> : null}
              <div className="settings-notice"><ShieldCheck size={16} /><span>Settings are saved only in this browser. No private key is requested.</span></div>
              <button className="button button-primary settings-submit" type="submit">Save contract settings <ArrowRight size={17} /></button>
            </form>
            <button className="modal-close-text" type="button" onClick={() => setSettingsOpen(false)}>Cancel</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
