import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";
const ERR_UNAUTHORIZED = 3000;
const ERR_BATCH_NOT_FOUND = 3001;
const ERR_INVALID_BATCH_ID = 3002;
const ERR_INVALID_NEW_OWNER = 3003;
const ERR_TRANSFER_IN_PROGRESS = 3004;
const ERR_TRANSFER_ALREADY_COMPLETED = 3005;
const ERR_INSUFFICIENT_FUNDS = 3006;
const ERR_INVALID_ESCROW_AMOUNT = 3007;
const ERR_ESCROW_NOT_FOUND = 3008;
const ERR_INVALID_TIMESTAMP = 3009;
const ERR_MAX_TRANSFERS_EXCEEDED = 3010;
const ERR_INVALID_FEE = 3011;
const ERR_AUTHORITY_NOT_SET = 3012;
const ERR_TRANSFER_FAILED = 3013;
interface Transfer {
  batchId: number;
  fromOwner: string;
  toOwner: string;
  timestamp: number;
  escrowAmount: number;
  status: string;
  createdAt: number;
}
interface TransferHistory {
  transferId: number;
  from: string;
  to: string;
  timestamp: number;
}
interface Escrow {
  amount: number;
  lockedBy: string;
  releaseTo: string;
}
interface TransferUpdate {
  updateStatus: string;
  updateTimestamp: number;
  updater: string;
}
interface Result<T> {
  ok: boolean;
  value: T;
}
class OwnershipTransferMock {
  state: {
    lastTransferId: number;
    totalTransfers: number;
    maxTransfers: number;
    transferFee: number;
    authorityContract: string | null;
    transfers: Map<number, Transfer>;
    transferHistory: Map<string, TransferHistory>;
    escrows: Map<number, Escrow>;
    transferUpdates: Map<number, TransferUpdate>;
  } = {
    lastTransferId: 0,
    totalTransfers: 0,
    maxTransfers: 5000,
    transferFee: 300,
    authorityContract: null,
    transfers: new Map(),
    transferHistory: new Map(),
    escrows: new Map(),
    transferUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1OWNER";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  constructor() {
    this.reset();
  }
  reset() {
    this.state = {
      lastTransferId: 0,
      totalTransfers: 0,
      maxTransfers: 5000,
      transferFee: 300,
      authorityContract: null,
      transfers: new Map(),
      transferHistory: new Map(),
      escrows: new Map(),
      transferUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1OWNER";
    this.stxTransfers = [];
  }
  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }
  setMaxTransfers(newMax: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxTransfers = newMax;
    return { ok: true, value: true };
  }
  setTransferFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newFee < 0) return { ok: false, value: false };
    this.state.transferFee = newFee;
    return { ok: true, value: true };
  }
  initiateTransfer(
    batchId: number,
    newOwner: string,
    timestamp: number,
    escrowAmount: number
  ): Result<number> {
    if (this.state.lastTransferId >= this.state.maxTransfers)
      return { ok: false, value: ERR_MAX_TRANSFERS_EXCEEDED };
    if (!this.isStandardPrincipal(newOwner))
      return { ok: false, value: ERR_INVALID_NEW_OWNER };
    if (timestamp < this.blockHeight)
      return { ok: false, value: ERR_INVALID_TIMESTAMP };
    if (escrowAmount <= 0)
      return { ok: false, value: ERR_INVALID_ESCROW_AMOUNT };
    if (this.caller === newOwner)
      return { ok: false, value: ERR_INVALID_NEW_OWNER };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    this.stxTransfers.push({
      amount: this.state.transferFee,
      from: this.caller,
      to: this.state.authorityContract,
    });
    const nextId = this.state.lastTransferId;
    const historyCount = Array.from(this.state.transferHistory.keys()).filter(
      (k) => k.startsWith(`${batchId}-`)
    ).length;
    const transfer: Transfer = {
      batchId,
      fromOwner: this.caller,
      toOwner: newOwner,
      timestamp,
      escrowAmount,
      status: "pending",
      createdAt: this.blockHeight,
    };
    this.state.transfers.set(nextId, transfer);
    this.state.transferHistory.set(`${batchId}-${historyCount}`, {
      transferId: nextId,
      from: this.caller,
      to: newOwner,
      timestamp: this.blockHeight,
    });
    this.state.escrows.set(nextId, {
      amount: escrowAmount,
      lockedBy: this.caller,
      releaseTo: newOwner,
    });
    this.state.lastTransferId++;
    this.state.totalTransfers++;
    return { ok: true, value: nextId };
  }
  isStandardPrincipal(p: string): boolean {
    return p.startsWith("ST");
  }
  getTransfer(id: number): Transfer | null {
    return this.state.transfers.get(id) || null;
  }
  acceptTransfer(transferId: number): Result<boolean> {
    const transfer = this.state.transfers.get(transferId);
    if (!transfer) return { ok: false, value: false };
    if (transfer.toOwner !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    if (transfer.status !== "pending")
      return { ok: false, value: ERR_TRANSFER_IN_PROGRESS };
    transfer.status = "accepted";
    this.state.transfers.set(transferId, transfer);
    this.state.transferUpdates.set(transferId, {
      updateStatus: "accepted",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }
  rejectTransfer(transferId: number, reason: string): Result<boolean> {
    const transfer = this.state.transfers.get(transferId);
    const escrow = this.state.escrows.get(transferId);
    if (!transfer || !escrow) return { ok: false, value: false };
    if (transfer.fromOwner !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    if (transfer.status !== "pending")
      return { ok: false, value: ERR_TRANSFER_IN_PROGRESS };
    transfer.status = "rejected";
    this.state.transfers.set(transferId, transfer);
    this.state.transferUpdates.set(transferId, {
      updateStatus: "rejected",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    this.state.escrows.delete(transferId);
    return { ok: true, value: true };
  }
  completeTransfer(transferId: number): Result<boolean> {
    const transfer = this.state.transfers.get(transferId);
    const escrow = this.state.escrows.get(transferId);
    if (!transfer || !escrow) return { ok: false, value: false };
    if (transfer.toOwner !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    if (transfer.status !== "accepted")
      return { ok: false, value: ERR_TRANSFER_IN_PROGRESS };
    transfer.status = "completed";
    this.state.transfers.set(transferId, transfer);
    this.state.transferUpdates.set(transferId, {
      updateStatus: "completed",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    this.state.escrows.delete(transferId);
    return { ok: true, value: true };
  }
  cancelTransfer(transferId: number): Result<boolean> {
    const transfer = this.state.transfers.get(transferId);
    const escrow = this.state.escrows.get(transferId);
    if (!transfer || !escrow) return { ok: false, value: false };
    if (transfer.fromOwner !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    if (transfer.status !== "pending")
      return { ok: false, value: ERR_TRANSFER_IN_PROGRESS };
    transfer.status = "cancelled";
    this.state.transfers.set(transferId, transfer);
    this.state.transferUpdates.set(transferId, {
      updateStatus: "cancelled",
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    this.state.escrows.delete(transferId);
    return { ok: true, value: true };
  }
  getTransferCount(): Result<number> {
    return { ok: true, value: this.state.lastTransferId };
  }
  checkTransferExistence(transferId: number): Result<boolean> {
    return { ok: true, value: this.state.transfers.has(transferId) };
  }
  checkTransferStatus(transferId: number): Result<string> {
    const transfer = this.state.transfers.get(transferId);
    if (!transfer) return { ok: false, value: "" };
    return { ok: true, value: transfer.status };
  }
}
describe("OwnershipTransfer", () => {
  let contract: OwnershipTransferMock;
  beforeEach(() => {
    contract = new OwnershipTransferMock();
    contract.reset();
  });
  it("initiates a transfer successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const transfer = contract.getTransfer(0);
    expect(transfer?.toOwner).toBe("ST2NEW");
    expect(transfer?.status).toBe("pending");
    expect(contract.stxTransfers).toEqual([
      { amount: 300, from: "ST1OWNER", to: "ST2AUTH" },
    ]);
  });
  it("rejects initiation without authority", () => {
    const result = contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });
  it("rejects invalid new owner principal", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.initiateTransfer(1, "INVALID", 1731328000, 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_NEW_OWNER);
  });
  it("rejects invalid timestamp", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.initiateTransfer(
      1,
      "ST2NEW",
      contract.blockHeight - 1,
      1000
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIMESTAMP);
  });
  it("rejects invalid escrow amount", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.initiateTransfer(1, "ST2NEW", 1731328000, 0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ESCROW_AMOUNT);
  });
  it("rejects same owner transfer", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.initiateTransfer(1, "ST1OWNER", 1731328000, 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_NEW_OWNER);
  });
  it("accepts a transfer successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST2NEW";
    const result = contract.acceptTransfer(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const transfer = contract.getTransfer(0);
    expect(transfer?.status).toBe("accepted");
  });
  it("rejects accept by non-to-owner", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST3FAKE";
    const result = contract.acceptTransfer(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("rejects accept on non-pending transfer", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST2NEW";
    contract.acceptTransfer(0);
    const result = contract.acceptTransfer(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TRANSFER_IN_PROGRESS);
  });
  it("rejects a transfer successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST1OWNER";
    const result = contract.rejectTransfer(0, "reason");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const transfer = contract.getTransfer(0);
    expect(transfer?.status).toBe("rejected");
  });
  it("rejects reject by non-from-owner", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST3FAKE";
    const result = contract.rejectTransfer(0, "reason");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("rejects reject on non-pending transfer", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST2NEW";
    contract.acceptTransfer(0);
    contract.caller = "ST1OWNER";
    const result = contract.rejectTransfer(0, "reason");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TRANSFER_IN_PROGRESS);
  });
  it("completes a transfer successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST2NEW";
    contract.acceptTransfer(0);
    const result = contract.completeTransfer(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const transfer = contract.getTransfer(0);
    expect(transfer?.status).toBe("completed");
  });
  it("rejects complete by non-to-owner", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST2NEW";
    contract.acceptTransfer(0);
    contract.caller = "ST3FAKE";
    const result = contract.completeTransfer(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("rejects complete on non-accepted transfer", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST2NEW";
    const result = contract.completeTransfer(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TRANSFER_IN_PROGRESS);
  });
  it("cancels a transfer successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    const result = contract.cancelTransfer(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const transfer = contract.getTransfer(0);
    expect(transfer?.status).toBe("cancelled");
  });
  it("rejects cancel by non-from-owner", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST3FAKE";
    const result = contract.cancelTransfer(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("rejects cancel on non-pending transfer", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.caller = "ST2NEW";
    contract.acceptTransfer(0);
    contract.caller = "ST1OWNER";
    const result = contract.cancelTransfer(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TRANSFER_IN_PROGRESS);
  });
  it("returns correct transfer count", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    contract.initiateTransfer(2, "ST3NEW", 1731328100, 2000);
    const result = contract.getTransferCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });
  it("checks transfer existence correctly", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    let result = contract.checkTransferExistence(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    result = contract.checkTransferExistence(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
  });
  it("checks transfer status correctly", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    const result = contract.checkTransferStatus(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe("pending");
  });
  it("sets transfer fee successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setTransferFee(500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.transferFee).toBe(500);
    contract.initiateTransfer(1, "ST2NEW", 1731328000, 1000);
    expect(contract.stxTransfers).toEqual([
      { amount: 500, from: "ST1OWNER", to: "ST2AUTH" },
    ]);
  });
});
