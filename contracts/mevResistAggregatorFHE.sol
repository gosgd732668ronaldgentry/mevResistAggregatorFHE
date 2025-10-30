pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MevResistAggregatorFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    mapping(uint256 => bool) public isBatchOpen;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event DataSubmitted(address indexed provider, uint256 indexed batchId, bytes32 encryptedData);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 result);

    error NotOwner();
    error NotProvider();
    error PausedState();
    error CooldownActive();
    error BatchClosedOrInvalid();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidBatchId();
    error InvalidCooldown();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedState();
        _;
    }

    modifier respectCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        if (_paused) {
            paused = true;
            emit Paused(msg.sender);
        } else {
            paused = false;
            emit Unpaused(msg.sender);
        }
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds == cooldownSeconds) revert InvalidCooldown();
        emit CooldownSecondsSet(cooldownSeconds, newCooldownSeconds);
        cooldownSeconds = newCooldownSeconds;
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        isBatchOpen[currentBatchId] = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (!isBatchOpen[batchId]) revert BatchClosedOrInvalid();
        isBatchOpen[batchId] = false;
        emit BatchClosed(batchId);
    }

    function submitEncryptedData(uint256 batchId, bytes32 encryptedData) external onlyProvider whenNotPaused respectCooldown {
        if (!isBatchOpen[batchId]) revert BatchClosedOrInvalid();

        lastSubmissionTime[msg.sender] = block.timestamp;
        // In a real implementation, encryptedData would be stored and processed.
        // For this example, we'll just emit an event.
        emit DataSubmitted(msg.sender, batchId, encryptedData);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32[2] storage encryptedValues) internal {
        if (!encryptedValues[0].isInitialized()) {
            encryptedValues[0] = FHE.asEuint32(0);
        }
        if (!encryptedValues[1].isInitialized()) {
            encryptedValues[1] = FHE.asEuint32(0);
        }
    }

    function _requireInitialized(euint32[2] storage encryptedValues) internal view {
        if (!encryptedValues[0].isInitialized() || !encryptedValues[1].isInitialized()) {
            revert("FHE state not initialized");
        }
    }

    // Example function to demonstrate FHE operations and decryption request
    // This is a simplified example. A real MEV-resistant aggregator would have more complex logic.
    function aggregateAndRequestDecryption(uint256 batchId, euint32[2] storage encryptedValues) external onlyProvider whenNotPaused {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (!isBatchOpen[batchId]) revert BatchClosedOrInvalid();

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        _initIfNeeded(encryptedValues);
        _requireInitialized(encryptedValues);

        // Example FHE operations:
        // Add the two encrypted values
        euint32 memory encryptedSum = encryptedValues[0].add(encryptedValues[1]);
        // Compare the sum to a threshold (e.g., 100)
        euint32 memory threshold = FHE.asEuint32(100);
        ebool memory isAboveThreshold = encryptedSum.ge(threshold);
        // Convert the boolean result to an encrypted uint32 for decryption
        euint32 memory resultToDecrypt = isAboveThreshold.select(FHE.asEuint32(1), FHE.asEuint32(0));

        // Prepare ciphertexts for decryption
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = resultToDecrypt.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        DecryptionContext storage ctx = decryptionContexts[requestId];

        // Replay guard
        if (ctx.processed) {
            revert ReplayAttempt();
        }

        // State verification
        // Rebuild the cts array in the exact same order as during the request.
        // For this example, we know it was one euint32.
        // In a real scenario, you'd need to reconstruct the cts based on the batchId or other stored info.
        // For simplicity, we assume the state to verify is fixed or can be derived.
        // Here, we'll simulate by creating a dummy cts array.
        // A more robust implementation would store the cts or data to reconstruct them.
        // For this example, we'll use a placeholder:
        bytes32[] memory ctsToVerify = new bytes32[](1); // Placeholder for actual ciphertexts
        // In a real contract, you would fetch the actual ciphertexts that were used for this request.
        // For example, if you stored them: ctsToVerify[0] = someStorage[ctx.batchId].toBytes32();
        // For this example, we'll just use a dummy value for demonstration.
        // The key is that the order and content must match the original request.
        // If the original cts were derived from contract state, that state must be used here.

        // Re-calculate the hash
        bytes32 currentHash = _hashCiphertexts(ctsToVerify); // Use the actual ctsToVerify

        if (currentHash != ctx.stateHash) {
            revert StateMismatch();
        }

        // Proof verification
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode & Finalize
        // The cleartexts are in the same order as cts.
        // For this example, we expect one uint32.
        uint32 result = abi.decode(cleartexts, (uint32));

        ctx.processed = true;
        emit DecryptionCompleted(requestId, ctx.batchId, result);

        // Further actions with the decrypted result would go here.
    }
}