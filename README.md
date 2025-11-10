# 🌿 Decentralized Organic Supply Chain Tracker

Welcome to a transparent, tamper-proof system for tracking organic produce from farm to fork on the Stacks blockchain! This Web3 project empowers farmers, suppliers, and consumers to verify authenticity, reduce fraud, and ensure food safety—solving the real-world problem of counterfeit organics and opaque supply chains that cost the industry billions annually.

## ✨ Features
🌱 **Farmer Registration**: Securely mint and register organic products with batch details and certifications  
🚚 **Shipment Tracking**: Log transfers between suppliers with geolocation timestamps and custody proofs  
🔍 **Real-Time Verification**: Consumers scan QR codes to trace product journeys and validate authenticity  
⚖️ **Dispute Resolution**: Automated escrow and voting for resolving supply chain disputes  
📊 **Audit Trails**: Immutable logs for compliance audits and regulatory reporting  
🛡️ **Anti-Counterfeit Guards**: Prevent duplicate batches and flag suspicious transfers  
💰 **Reward Incentives**: Token rewards for honest participants to encourage ecosystem participation  

## 🛠 How It Works
Powered by 8 Clarity smart contracts on Stacks for modularity and security:

**Core Contracts**:
- `product-registry.clar`: Registers new organic batches with hashes, harvest dates, and farmer proofs.
- `shipment-tracker.clar`: Handles custody transfers with timestamps and multi-sig approvals.
- `ownership-transfer.clar`: Manages batch ownership changes between farmers, transporters, and retailers.
- `verification-oracle.clar`: Queries off-chain data (e.g., QR scans) to confirm product integrity.

**Support Contracts**:
- `dispute-resolver.clar`: Locks funds in escrow and enables community voting for claims.
- `certification-manager.clar`: Issues and revokes organic certs with expiration logic.
- `audit-logger.clar`: Stores tamper-proof event logs for full traceability.
- `incentive-distributor.clar`: Distributes STX-based rewards based on verified contributions.

**For Farmers**:
- Deploy a batch via `product-registry` with SHA-256 hash of harvest docs.
- Initiate shipment in `shipment-tracker` with recipient details.
Your produce is now blockchain-secured from the start!

**For Suppliers/Retailers**:
- Accept transfer in `ownership-transfer` and log arrival in `shipment-tracker`.
- Resolve issues via `dispute-resolver` if needed.
Seamless handoffs with instant proofs.

**For Consumers**:
- Scan QR to call `verification-oracle` for full chain history.
- Report fakes to trigger audits in `audit-logger`.
Empower your shopping with trust!

Clarity-based decentralized supply chains: Trace every leaf, build unbreakable trust.