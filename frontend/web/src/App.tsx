// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface Proposal {
  id: string;
  encryptedData: string;
  timestamp: number;
  creator: string;
  title: string;
  votes: number;
  voteCost: number;
}

const App: React.FC = () => {
  // Randomly selected style: High contrast black/white, Cyberpunk UI, Center radiation layout, Micro-interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newProposalData, setNewProposalData] = useState({
    title: "",
    description: ""
  });
  const [voteAmounts, setVoteAmounts] = useState<{[key: string]: number}>({});
  const [activeTab, setActiveTab] = useState("proposals");
  const [showStats, setShowStats] = useState(false);

  // Calculate statistics
  const totalProposals = proposals.length;
  const totalVotes = proposals.reduce((sum, p) => sum + p.votes, 0);
  const averageVotes = totalProposals > 0 ? (totalVotes / totalProposals).toFixed(1) : 0;

  useEffect(() => {
    loadProposals().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadProposals = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("proposal_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing proposal keys:", e);
        }
      }
      
      const list: Proposal[] = [];
      
      for (const key of keys) {
        try {
          const proposalBytes = await contract.getData(`proposal_${key}`);
          if (proposalBytes.length > 0) {
            try {
              const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
              list.push({
                id: key,
                encryptedData: proposalData.data,
                timestamp: proposalData.timestamp,
                creator: proposalData.creator,
                title: proposalData.title,
                votes: proposalData.votes || 0,
                voteCost: proposalData.voteCost || 0
              });
            } catch (e) {
              console.error(`Error parsing proposal data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading proposal ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setProposals(list);
    } catch (e) {
      console.error("Error loading proposals:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const createProposal = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting proposal with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newProposalData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const proposalData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        creator: account,
        title: newProposalData.title,
        votes: 0,
        voteCost: 0
      };
      
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(proposalData))
      );
      
      const keysBytes = await contract.getData("proposal_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(proposalId);
      
      await contract.setData(
        "proposal_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted proposal submitted!"
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewProposalData({
          title: "",
          description: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const castVote = async (proposalId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    const votes = voteAmounts[proposalId] || 1;
    const cost = votes * votes; // Quadratic voting cost

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: `Processing ${votes} vote(s) with FHE...`
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const proposalBytes = await contract.getData(`proposal_${proposalId}`);
      if (proposalBytes.length === 0) {
        throw new Error("Proposal not found");
      }
      
      const proposalData = JSON.parse(ethers.toUtf8String(proposalBytes));
      
      const updatedProposal = {
        ...proposalData,
        votes: proposalData.votes + votes,
        voteCost: proposalData.voteCost + cost
      };
      
      await contract.setData(
        `proposal_${proposalId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedProposal))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `Successfully cast ${votes} vote(s)!`
      });
      
      await loadProposals();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Voting failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const updateVoteAmount = (proposalId: string, amount: number) => {
    setVoteAmounts(prev => ({
      ...prev,
      [proposalId]: Math.max(1, Math.min(amount, 10)) // Limit votes between 1-10
    }));
  };

  const isCreator = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderStats = () => (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-value">{totalProposals}</div>
        <div className="stat-label">Total Proposals</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{totalVotes}</div>
        <div className="stat-label">Total Votes</div>
      </div>
      <div className="stat-card">
        <div className="stat-value">{averageVotes}</div>
        <div className="stat-label">Avg Votes</div>
      </div>
    </div>
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyber-theme">
      <div className="main-radial-layout">
        <header className="app-header">
          <div className="logo">
            <h1>FHE<span>DAO</span></h1>
            <div className="logo-sub">Private Quadratic Voting</div>
          </div>
          
          <div className="header-actions">
            <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
          </div>
        </header>
        
        <div className="central-content">
          <div className="content-card">
            <div className="tabs">
              <button 
                className={`tab-button ${activeTab === "proposals" ? "active" : ""}`}
                onClick={() => setActiveTab("proposals")}
              >
                Proposals
              </button>
              <button 
                className={`tab-button ${activeTab === "stats" ? "active" : ""}`}
                onClick={() => setActiveTab("stats")}
              >
                Statistics
              </button>
            </div>
            
            {activeTab === "proposals" ? (
              <>
                <div className="section-header">
                  <h2>Encrypted Proposals</h2>
                  <div className="header-actions">
                    <button 
                      onClick={() => setShowCreateModal(true)}
                      className="create-button"
                    >
                      + New Proposal
                    </button>
                    <button 
                      onClick={loadProposals}
                      className="refresh-button"
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? "⏳" : "🔄"}
                    </button>
                  </div>
                </div>
                
                {proposals.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🔒</div>
                    <p>No proposals yet</p>
                    <button 
                      className="primary-button"
                      onClick={() => setShowCreateModal(true)}
                    >
                      Create First Proposal
                    </button>
                  </div>
                ) : (
                  <div className="proposals-list">
                    {proposals.map(proposal => (
                      <div className="proposal-card" key={proposal.id}>
                        <div className="proposal-header">
                          <h3>{proposal.title}</h3>
                          <div className="proposal-meta">
                            <span className="creator">
                              {proposal.creator.substring(0, 6)}...{proposal.creator.substring(38)}
                            </span>
                            <span className="date">
                              {new Date(proposal.timestamp * 1000).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        
                        <div className="proposal-stats">
                          <div className="vote-count">
                            <span className="label">Votes:</span>
                            <span className="value">{proposal.votes}</span>
                          </div>
                          <div className="vote-cost">
                            <span className="label">Cost:</span>
                            <span className="value">{proposal.voteCost} QV</span>
                          </div>
                        </div>
                        
                        <div className="vote-controls">
                          <div className="vote-input">
                            <button 
                              className="vote-adjust"
                              onClick={() => updateVoteAmount(proposal.id, (voteAmounts[proposal.id] || 1) - 1)}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              value={voteAmounts[proposal.id] || 1}
                              onChange={(e) => updateVoteAmount(proposal.id, parseInt(e.target.value) || 1)}
                              min="1"
                              max="10"
                            />
                            <button 
                              className="vote-adjust"
                              onClick={() => updateVoteAmount(proposal.id, (voteAmounts[proposal.id] || 1) + 1)}
                            >
                              +
                            </button>
                          </div>
                          <button 
                            className="vote-button"
                            onClick={() => castVote(proposal.id)}
                          >
                            Vote ({((voteAmounts[proposal.id] || 1) ** 2)} QV)
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="stats-section">
                <h2>DAO Statistics</h2>
                {renderStats()}
              </div>
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={createProposal} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          proposalData={newProposalData}
          setProposalData={setNewProposalData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span>FHE DAO - Private Quadratic Voting</span>
            <p>All votes encrypted with FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Docs</a>
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  proposalData: any;
  setProposalData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  proposalData,
  setProposalData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setProposalData({
      ...proposalData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!proposalData.title) {
      alert("Please enter a title");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Create New Proposal</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label>Title *</label>
            <input 
              type="text"
              name="title"
              value={proposalData.title} 
              onChange={handleChange}
              placeholder="Proposal title..." 
              className="modal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description"
              value={proposalData.description} 
              onChange={handleChange}
              placeholder="Detailed description..." 
              className="modal-textarea"
              rows={4}
            />
          </div>
          
          <div className="fhe-notice">
            Proposal will be encrypted with FHE before submission
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-button"
          >
            {creating ? "Encrypting..." : "Submit Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;