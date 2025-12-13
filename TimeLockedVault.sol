//Time-Locked Message Vault Smart Contract
pragma solidity ^0.8.0;

/*
    Time-Locked Message Vault
    -------------------------
    Users can store encrypted messages that unlock only after a future unlockTime.
    Owner cannot read anyone’s messages.
    Users can delete or update their own locked messages.
*/

contract TimeLockedVault {

    struct Message {
        string encryptedMessage;   // User stores encrypted text (off-chain or simple base64/hashed)
        uint256 unlockTime;        // Unix timestamp when message becomes readable
        bool exists;
    }

    mapping(address => Message) private vaults;

    event MessageStored(address indexed user, uint256 unlockTime);
    event MessageUpdated(address indexed user, uint256 newUnlockTime);
    event MessageDeleted(address indexed user);

    // Store an encrypted message with future unlock time
    function storeMessage(string calldata encryptedMsg, uint256 unlockTime) external {
        require(bytes(encryptedMsg).length > 0, "Message cannot be empty");
        require(unlockTime > block.timestamp, "Unlock time must be in the future");

        vaults[msg.sender] = Message(encryptedMsg, unlockTime, true);

        emit MessageStored(msg.sender, unlockTime);
    }

    // Read your own message ONLY after unlockTime
    function readMessage() external view returns (string memory) {
        require(vaults[msg.sender].exists, "No message stored");
        require(block.timestamp >= vaults[msg.sender].unlockTime, "Message still locked");

        return vaults[msg.sender].encryptedMessage;
    }

    // Update your stored message or change unlock time
    function updateMessage(string calldata newMsg, uint256 newUnlockTime) external {
        require(vaults[msg.sender].exists, "No message to update");
        require(bytes(newMsg).length > 0, "Message cannot be empty");
        require(newUnlockTime > block.timestamp, "Unlock time must be in the future");

        vaults[msg.sender] = Message(newMsg, newUnlockTime, true);

        emit MessageUpdated(msg.sender, newUnlockTime);
    }

    // Delete your message from the vault
    function deleteMessage() external {
        require(vaults[msg.sender].exists, "Nothing to delete");

        delete vaults[msg.sender];

        emit MessageDeleted(msg.sender);
    }

    // Check when your message will unlock
    function getUnlockTime() external view returns (uint256) {
        require(vaults[msg.sender].exists, "No stored message");
        return vaults[msg.sender].unlockTime;
    }
}
