// Imported TimeLockedVault.sol exposes storeMessage(string,uint256),
// getUnlockTime(), readMessage(), updateMessage(string,uint256), deleteMessage().
// It indexes ONE record by msg.sender and has no independent record ID or
// key escrow interface. A single server signer would overwrite older records.
// TimeCheck.sol only returns block.timestamp; it is not a release authority.
// Accordingly there is no compatible multi-record contract adapter in this
// import. Never advertise contract-backed mode or fabricate transaction receipts.
export function storageConfiguration() {
  return {
    mode: 'server-managed' as const,
    available: true,
    contractSupported: false,
    contractReason: 'The imported contract holds one entry per wallet and cannot register multiple independently releasable vault records.',
    custody: 'The server escrows encryption keys and can access them. Release is enforced by the server clock, not a blockchain.',
  };
}
