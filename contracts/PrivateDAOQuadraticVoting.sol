// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract PrivateDAOQuadraticVoting is SepoliaConfig {
    // Proposal structure with encrypted content
    struct EncryptedProposal {
        uint256 id;
        euint32 encryptedTitle;      // Encrypted proposal title
        euint32 encryptedDetails;    // Encrypted proposal details
        euint32 encryptedVoteCount;  // Encrypted vote tally
        euint32 encryptedCostSum;    // Encrypted quadratic cost sum
        uint256 endTime;             // Voting deadline
    }
    
    // Member voting information
    struct MemberVote {
        euint32 encryptedVotes;      // Encrypted vote count
        bool hasVoted;               // Voting status flag
    }

    // Contract state
    uint256 public proposalCount;
    mapping(uint256 => EncryptedProposal) public encryptedProposals;
    mapping(uint256 => mapping(address => MemberVote)) public memberVotes;
    mapping(address => uint256) public memberTokenBalances;
    
    // Voting parameters
    uint256 public constant VOTING_PERIOD = 7 days;
    uint256 public constant MAX_VOTES_PER_PROPOSAL = 100;
    
    // Events
    event ProposalCreated(uint256 indexed id, uint256 endTime);
    event VoteCast(uint256 indexed proposalId, address indexed voter);
    event VoteTallyDecrypted(uint256 indexed proposalId);
    
    // Ensures voting period is active
    modifier votingOpen(uint256 proposalId) {
        require(block.timestamp < encryptedProposals[proposalId].endTime, "Voting closed");
        _;
    }
    
    // Ensures member has sufficient tokens
    modifier sufficientTokens(uint256 voteCount) {
        require(memberTokenBalances[msg.sender] >= voteCount * voteCount, "Insufficient tokens");
        _;
    }

    /// @notice Creates a new encrypted proposal
    function createEncryptedProposal(
        euint32 encryptedTitle,
        euint32 encryptedDetails
    ) public {
        proposalCount += 1;
        uint256 newId = proposalCount;
        
        encryptedProposals[newId] = EncryptedProposal({
            id: newId,
            encryptedTitle: encryptedTitle,
            encryptedDetails: encryptedDetails,
            encryptedVoteCount: FHE.asEuint32(0),
            encryptedCostSum: FHE.asEuint32(0),
            endTime: block.timestamp + VOTING_PERIOD
        });
        
        emit ProposalCreated(newId, block.timestamp + VOTING_PERIOD);
    }
    
    /// @notice Cast encrypted quadratic vote
    function castEncryptedVote(
        uint256 proposalId,
        euint32 encryptedVoteCount
    ) public votingOpen(proposalId) {
        require(!memberVotes[proposalId][msg.sender].hasVoted, "Already voted");
        
        // Store encrypted vote
        memberVotes[proposalId][msg.sender] = MemberVote({
            encryptedVotes: encryptedVoteCount,
            hasVoted: true
        });
        
        // Update proposal vote tally
        encryptedProposals[proposalId].encryptedVoteCount = 
            FHE.add(encryptedProposals[proposalId].encryptedVoteCount, encryptedVoteCount);
        
        // Calculate quadratic cost (voteCount^2)
        euint32 encryptedCost = FHE.mul(encryptedVoteCount, encryptedVoteCount);
        
        // Update total cost
        encryptedProposals[proposalId].encryptedCostSum = 
            FHE.add(encryptedProposals[proposalId].encryptedCostSum, encryptedCost);
        
        emit VoteCast(proposalId, msg.sender);
    }
    
    /// @notice Request vote tally decryption
    function requestVoteTallyDecryption(uint256 proposalId) public {
        require(block.timestamp >= encryptedProposals[proposalId].endTime, "Voting still open");
        
        // Prepare encrypted data for decryption
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(encryptedProposals[proposalId].encryptedVoteCount);
        ciphertexts[1] = FHE.toBytes32(encryptedProposals[proposalId].encryptedCostSum);
        
        // Request decryption
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptVoteTally.selector);
    }
    
    /// @notice Callback for decrypted vote tally
    function decryptVoteTally(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        // Verify decryption proof
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted values
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        uint256 proposalId = requestId; // Simplified mapping
        
        // Store decrypted results (in real implementation)
        // totalVotes = results[0];
        // totalCost = results[1];
        
        emit VoteTallyDecrypted(proposalId);
    }
    
    /// @notice Deposit tokens for voting
    function depositTokens() public payable {
        memberTokenBalances[msg.sender] += msg.value;
    }
    
    /// @notice Withdraw unused tokens
    function withdrawTokens(uint256 amount) public {
        require(memberTokenBalances[msg.sender] >= amount, "Insufficient balance");
        memberTokenBalances[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }
}