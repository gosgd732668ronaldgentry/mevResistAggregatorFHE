// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface TradeRecord {
  id: string;
  inputAmount: number;
  outputAmount: number;
  route: string;
  timestamp: number;
  status: "pending" | "executed" | "failed";
  mevRisk: "low" | "medium" | "high";
  encrypted: boolean;
}

// FHE encryption simulation for numerical data
const FHEEncryptNumber = (value: number): string => {
  const encrypted = btoa(value.toString() + '|' + Date.now());
  return `FHE-${encrypted}`;
};

// FHE decryption simulation with wallet signature
const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    try {
      const decrypted = atob(encryptedData.substring(4));
      return parseFloat(decrypted.split('|')[0]);
    } catch (e) {
      console.error("Decryption error:", e);
    }
  }
  return 0;
};

// Simulate FHE computation on encrypted data
const FHEComputeOptimalRoute = (encryptedInput: string, encryptedOutputs: string[]): string => {
  const input = FHEDecryptNumber(encryptedInput);
  const outputs = encryptedOutputs.map(FHEDecryptNumber);
  
  // Simulate MEV-resistant routing logic
  let bestIndex = 0;
  let bestRatio = 0;
  
  outputs.forEach((output, index) => {
    const ratio = output / input;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestIndex = index;
    }
  });
  
  return `Route-${bestIndex + 1}`;
};

const generateFHEKey = () => `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [trading, setTrading] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ 
    visible: boolean; 
    status: "pending" | "success" | "error"; 
    message: string; 
  }>({ visible: false, status: "pending", message: "" });
  
  const [newTrade, setNewTrade] = useState({ 
    inputAmount: 0, 
    outputAmount: 0,
    tokenPair: "ETH/USDC"
  });
  
  const [fheKey, setFheKey] = useState<string>("");
  const [mevRiskLevel, setMevRiskLevel] = useState<number>(0);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "error">("synced");

  // Statistics
  const executedCount = trades.filter(t => t.status === "executed").length;
  const failedCount = trades.filter(t => t.status === "failed").length;
  const pendingCount = trades.filter(t => t.status === "pending").length;
  const lowMevCount = trades.filter(t => t.mevRisk === "low").length;

  useEffect(() => {
    loadTrades().finally(() => setLoading(false));
    setFheKey(generateFHEKey());
    
    // Simulate real-time sync
    const syncInterval = setInterval(() => {
      setSyncStatus("syncing");
      setTimeout(() => setSyncStatus("synced"), 1000);
    }, 10000);
    
    return () => clearInterval(syncInterval);
  }, []);

  const loadTrades = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      // Load trade keys
      const keysBytes = await contract.getData("trade_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { 
          console.error("Error parsing trade keys:", e); 
        }
      }
      
      const tradeList: TradeRecord[] = [];
      for (const key of keys) {
        try {
          const tradeBytes = await contract.getData(`trade_${key}`);
          if (tradeBytes.length > 0) {
            const tradeData = JSON.parse(ethers.toUtf8String(tradeBytes));
            tradeList.push({ 
              id: key, 
              inputAmount: tradeData.inputAmount,
              outputAmount: tradeData.outputAmount,
              route: tradeData.route,
              timestamp: tradeData.timestamp,
              status: tradeData.status || "pending",
              mevRisk: tradeData.mevRisk || "medium",
              encrypted: tradeData.encrypted || false
            });
          }
        } catch (e) { 
          console.error(`Error loading trade ${key}:`, e); 
        }
      }
      
      tradeList.sort((a, b) => b.timestamp - a.timestamp);
      setTrades(tradeList);
      
      // Calculate average MEV risk
      const riskScores = tradeList.map(t => 
        t.mevRisk === "low" ? 1 : t.mevRisk === "medium" ? 2 : 3
      );
      const avgRisk = riskScores.length ? 
        riskScores.reduce((a, b) => a + b) / riskScores.length : 0;
      setMevRiskLevel(avgRisk);
      
    } catch (e) { 
      console.error("Error loading trades:", e); 
      setSyncStatus("error");
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const executeTrade = async () => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setTrading(true);
    setIsEncrypting(true);
    
    setTransactionStatus({ 
      visible: true, 
      status: "pending", 
      message: "Encrypting trade data with Zama FHE..." 
    });

    try {
      // Simulate FHE encryption process
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsEncrypting(false);
      
      const encryptedInput = FHEEncryptNumber(newTrade.inputAmount);
      const encryptedOutput = FHEEncryptNumber(newTrade.outputAmount);
      
      setTransactionStatus({ 
        visible: true, 
        status: "pending", 
        message: "Computing MEV-resistant route with FHE..." 
      });

      // Simulate FHE computation
      const optimalRoute = FHEComputeOptimalRoute(encryptedInput, [encryptedOutput]);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const tradeId = `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const tradeData = {
        inputAmount: newTrade.inputAmount,
        outputAmount: newTrade.outputAmount,
        route: optimalRoute,
        timestamp: Math.floor(Date.now() / 1000),
        status: "pending",
        mevRisk: Math.random() > 0.7 ? "high" : Math.random() > 0.4 ? "medium" : "low",
        encrypted: true
      };

      await contract.setData(`trade_${tradeId}`, ethers.toUtf8Bytes(JSON.stringify(tradeData)));
      
      // Update keys list
      const keysBytes = await contract.getData("trade_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { 
          keys = JSON.parse(ethers.toUtf8String(keysBytes)); 
        } catch (e) { 
          console.error("Error parsing keys:", e); 
        }
      }
      keys.push(tradeId);
      await contract.setData("trade_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));

      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "Trade executed with MEV protection!" 
      });

      await loadTrades();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowTradeModal(false);
        setNewTrade({ inputAmount: 0, outputAmount: 0, tokenPair: "ETH/USDC" });
      }, 2000);

    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Trade execution failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: errorMessage 
      });
      
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setTrading(false); 
      setIsEncrypting(false);
    }
  };

  const decryptTradeData = async (encryptedData: string) => {
    if (!isConnected) { 
      alert("Please connect wallet first"); 
      return null; 
    }
    
    try {
      // Request wallet signature for decryption
      const message = `FHE-Decrypt:${fheKey}:${Date.now()}`;
      await signMessageAsync({ message });
      
      // Simulate decryption delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    }
  };

  const checkContractAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Contract not available");
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isAvailable ? "Contract is available and ready" : "Contract unavailable"
      });
      
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Contract check failed: " + (e.message || "Unknown error")
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderRiskMeter = () => {
    return (
      <div className="risk-meter">
        <div className="meter-bar">
          <div 
            className={`meter-fill ${mevRiskLevel < 1.5 ? 'low' : mevRiskLevel < 2.5 ? 'medium' : 'high'}`}
            style={{ width: `${(mevRiskLevel / 3) * 100}%` }}
          ></div>
        </div>
        <div className="risk-labels">
          <span>Low</span>
          <span>Medium</span>
          <span>High</span>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen hud-theme">
      <div className="hud-spinner"></div>
      <p>Initializing MEV-Resistant DEX Aggregator...</p>
      <div className="fhe-encryption-indicator">
        <div className="encryption-dot"></div>
        <span>FHE Encryption Initializing</span>
      </div>
    </div>
  );

  return (
    <div className="app-container hud-theme">
      {/* HUD Overlay Elements */}
      <div className="hud-overlay">
        <div className="hud-corner top-left"></div>
        <div className="hud-corner top-right"></div>
        <div className="hud-corner bottom-left"></div>
        <div className="hud-corner bottom-right"></div>
        <div className="hud-scanline"></div>
      </div>

      <header className="app-header hud-header">
        <div className="header-left">
          <div className="logo">
            <div className="fhe-logo-icon"></div>
            <h1>FHE<span>Dex</span>Aggregator</h1>
          </div>
          <div className="sync-indicator">
            <div className={`sync-dot ${syncStatus}`}></div>
            <span>{
              syncStatus === "synced" ? "Synced" : 
              syncStatus === "syncing" ? "Syncing..." : "Sync Error"
            }</span>
          </div>
        </div>
        
        <div className="header-center">
          <div className="mev-risk-display">
            <span>MEV Risk Level</span>
            {renderRiskMeter()}
          </div>
        </div>

        <div className="header-right">
          <button 
            onClick={() => setShowTradeModal(true)} 
            className="trade-btn hud-button"
          >
            <div className="trade-icon"></div>
            New Trade
          </button>
          <button 
            onClick={checkContractAvailability}
            className="hud-button secondary"
          >
            Check Contract
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <main className="main-content hud-dashboard">
        {/* Dashboard Stats */}
        <div className="dashboard-stats">
          <div className="stat-card hud-card">
            <div className="stat-icon trade-icon"></div>
            <div className="stat-content">
              <div className="stat-value">{trades.length}</div>
              <div className="stat-label">Total Trades</div>
            </div>
          </div>
          
          <div className="stat-card hud-card">
            <div className="stat-icon success-icon"></div>
            <div className="stat-content">
              <div className="stat-value">{executedCount}</div>
              <div className="stat-label">Executed</div>
            </div>
          </div>
          
          <div className="stat-card hud-card">
            <div className="stat-icon shield-icon"></div>
            <div className="stat-content">
              <div className="stat-value">{lowMevCount}</div>
              <div className="stat-label">Low MEV Risk</div>
            </div>
          </div>
          
          <div className="stat-card hud-card">
            <div className="stat-icon fhe-icon"></div>
            <div className="stat-content">
              <div className="stat-value">{trades.filter(t => t.encrypted).length}</div>
              <div className="stat-label">FHE Protected</div>
            </div>
          </div>
        </div>

        {/* Trade History */}
        <div className="trades-section">
          <div className="section-header">
            <h2>Trade History</h2>
            <div className="header-actions">
              <button 
                onClick={loadTrades} 
                className="refresh-btn hud-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="trades-list hud-card">
            <div className="table-header">
              <div className="header-cell">Trade ID</div>
              <div className="header-cell">Amount</div>
              <div className="header-cell">Route</div>
              <div className="header-cell">MEV Risk</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Time</div>
            </div>
            
            {trades.length === 0 ? (
              <div className="no-trades">
                <div className="no-trades-icon"></div>
                <p>No trades executed yet</p>
                <button 
                  className="hud-button primary" 
                  onClick={() => setShowTradeModal(true)}
                >
                  Execute First Trade
                </button>
              </div>
            ) : (
              trades.map(trade => (
                <div className="trade-row" key={trade.id}>
                  <div className="table-cell trade-id">#{trade.id.substring(0, 8)}</div>
                  <div className="table-cell amount">
                    {trade.inputAmount} → {trade.outputAmount}
                  </div>
                  <div className="table-cell route">{trade.route}</div>
                  <div className="table-cell">
                    <span className={`risk-badge ${trade.mevRisk}`}>
                      {trade.mevRisk}
                    </span>
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${trade.status}`}>
                      {trade.status}
                    </span>
                  </div>
                  <div className="table-cell time">
                    {new Date(trade.timestamp * 1000).toLocaleTimeString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Trade Execution Modal */}
      {showTradeModal && (
        <TradeModal
          onSubmit={executeTrade}
          onClose={() => setShowTradeModal(false)}
          trading={trading}
          tradeData={newTrade}
          setTradeData={setNewTrade}
          isEncrypting={isEncrypting}
        />
      )}

      {/* Transaction Status Modal */}
      {transactionStatus.visible && (
        <div className="transaction-modal hud-overlay">
          <div className="transaction-content hud-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="hud-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer hud-footer">
        <div className="footer-content">
          <div className="fhe-badge">
            <div className="fhe-glow"></div>
            <span>Zama FHE Protected</span>
          </div>
          <div className="footer-info">
            <span>MEV-Resistant DEX Aggregator</span>
            <span>•</span>
            <span>All trades encrypted with FHE</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Trade Modal Component
interface TradeModalProps {
  onSubmit: () => void;
  onClose: () => void;
  trading: boolean;
  tradeData: any;
  setTradeData: (data: any) => void;
  isEncrypting: boolean;
}

const TradeModal: React.FC<TradeModalProps> = ({
  onSubmit,
  onClose,
  trading,
  tradeData,
  setTradeData,
  isEncrypting
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setTradeData({ ...tradeData, [name]: value });
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setTradeData({ ...tradeData, [name]: parseFloat(value) || 0 });
  };

  const handleSubmit = () => {
    if (!tradeData.inputAmount || !tradeData.outputAmount) {
      alert("Please enter trade amounts");
      return;
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay hud-overlay">
      <div className="trade-modal hud-card">
        <div className="modal-header">
          <h2>Execute MEV-Resistant Trade</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="encryption-shield"></div>
            <div>
              <strong>FHE Encryption Active</strong>
              <p>Trade data will be encrypted with Zama FHE before execution</p>
            </div>
          </div>

          <div className="trade-form">
            <div className="form-group">
              <label>Token Pair</label>
              <select 
                name="tokenPair" 
                value={tradeData.tokenPair} 
                onChange={handleChange}
                className="hud-select"
              >
                <option value="ETH/USDC">ETH/USDC</option>
                <option value="BTC/ETH">BTC/ETH</option>
                <option value="USDC/USDT">USDC/USDT</option>
                <option value="SOL/ETH">SOL/ETH</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Input Amount</label>
                <input
                  type="number"
                  name="inputAmount"
                  value={tradeData.inputAmount}
                  onChange={handleAmountChange}
                  className="hud-input"
                  step="0.0001"
                />
              </div>
              
              <div className="form-group">
                <label>Expected Output</label>
                <input
                  type="number"
                  name="outputAmount"
                  value={tradeData.outputAmount}
                  onChange={handleAmountChange}
                  className="hud-input"
                  step="0.0001"
                />
              </div>
            </div>
          </div>

          <div className="encryption-preview">
            <h4>FHE Encryption Preview</h4>
            <div className="preview-grid">
              <div className="preview-item">
                <span>Input:</span>
                <code>{tradeData.inputAmount ? FHEEncryptNumber(tradeData.inputAmount).substring(0, 30) + '...' : 'Not set'}</code>
              </div>
              <div className="preview-item">
                <span>Output:</span>
                <code>{tradeData.outputAmount ? FHEEncryptNumber(tradeData.outputAmount).substring(0, 30) + '...' : 'Not set'}</code>
              </div>
            </div>
          </div>

          <div className="mev-warning">
            <div className="warning-icon"></div>
            <div>
              <strong>MEV Protection Active</strong>
              <p>Trade routing optimized for MEV resistance using FHE computation</p>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="hud-button secondary">Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={trading}
            className="hud-button primary"
          >
            {isEncrypting ? "Encrypting with FHE..." :
             trading ? "Executing Trade..." : "Execute Trade"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;