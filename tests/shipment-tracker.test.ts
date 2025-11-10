import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";
const ERR_UNAUTHORIZED = 2000;
const ERR_BATCH_NOT_FOUND = 2001;
const ERR_INVALID_SHIPMENT_ID = 2002;
const ERR_INVALID_ORIGIN = 2003;
const ERR_INVALID_DESTINATION = 2004;
const ERR_INVALID_TIMESTAMP = 2005;
const ERR_INVALID_GEO = 2006;
const ERR_SHIPMENT_ALREADY_EXISTS = 2007;
const ERR_SHIPMENT_NOT_EXISTS = 2008;
const ERR_INSUFFICIENT_APPROVALS = 2009;
const ERR_MAX_APPROVERS_EXCEEDED = 2010;
const ERR_INVALID_APPROVER = 2011;
const ERR_APPROVAL_ALREADY_GIVEN = 2012;
const ERR_APPROVAL_NOT_FOUND = 2013;
const ERR_INVALID_FEE = 2014;
const ERR_AUTHORITY_NOT_SET = 2015;
const ERR_TRANSFER_INVALID = 2016;
const FULL_GEO = "45.5231,-122.6765";
interface Shipment {
  batchId: number;
  origin: string;
  destination: string;
  startTimestamp: number;
  geoStart: string;
  status: string;
  createdAt: number;
}
interface ShipmentUpdate {
  updateGeo: string;
  updateTimestamp: number;
  updater: string;
}
interface Result<T> {
  ok: boolean;
  value: T;
}
class ShipmentTrackerMock {
  state: {
    lastShipmentId: number;
    totalShipments: number;
    maxShipments: number;
    shipmentFee: number;
    authorityContract: string | null;
    shipments: Map<number, Shipment>;
    shipmentApprovals: Map<string, string>;
    approvalsGiven: Map<string, boolean>;
    shipmentUpdates: Map<number, ShipmentUpdate>;
  } = {
    lastShipmentId: 0,
    totalShipments: 0,
    maxShipments: 10000,
    shipmentFee: 200,
    authorityContract: null,
    shipments: new Map(),
    shipmentApprovals: new Map(),
    approvalsGiven: new Map(),
    shipmentUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1ORIGIN";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  constructor() {
    this.reset();
  }
  reset() {
    this.state = {
      lastShipmentId: 0,
      totalShipments: 0,
      maxShipments: 10000,
      shipmentFee: 200,
      authorityContract: null,
      shipments: new Map(),
      shipmentApprovals: new Map(),
      approvalsGiven: new Map(),
      shipmentUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1ORIGIN";
    this.stxTransfers = [];
  }
  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }
  setMaxShipments(newMax: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxShipments = newMax;
    return { ok: true, value: true };
  }
  setShipmentFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newFee < 0) return { ok: false, value: false };
    this.state.shipmentFee = newFee;
    return { ok: true, value: true };
  }
  initiateShipment(
    batchId: number,
    destination: string,
    startTimestamp: number,
    geoStart: string
  ): Result<number> {
    if (this.state.lastShipmentId >= this.state.maxShipments)
      return { ok: false, value: ERR_MAX_APPROVERS_EXCEEDED };
    if (!this.isStandardPrincipal(this.caller))
      return { ok: false, value: ERR_INVALID_ORIGIN };
    if (!this.isStandardPrincipal(destination))
      return { ok: false, value: ERR_INVALID_DESTINATION };
    if (startTimestamp < this.blockHeight)
      return { ok: false, value: ERR_INVALID_TIMESTAMP };
    if (geoStart.length === 0 || geoStart.length > 100)
      return { ok: false, value: ERR_INVALID_GEO };
    if (this.caller === destination)
      return { ok: false, value: ERR_INVALID_DESTINATION };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    this.stxTransfers.push({
      amount: this.state.shipmentFee,
      from: this.caller,
      to: this.state.authorityContract,
    });
    const nextId = this.state.lastShipmentId;
    const shipment: Shipment = {
      batchId,
      origin: this.caller,
      destination,
      startTimestamp,
      geoStart,
      status: "active",
      createdAt: this.blockHeight,
    };
    this.state.shipments.set(nextId, shipment);
    this.state.lastShipmentId++;
    this.state.totalShipments++;
    return { ok: true, value: nextId };
  }
  isStandardPrincipal(p: string): boolean {
    return p.startsWith("ST");
  }
  getShipment(id: number): Shipment | null {
    return this.state.shipments.get(id) || null;
  }
  addApprover(shipmentId: number, approver: string): Result<boolean> {
    const shipment = this.state.shipments.get(shipmentId);
    if (!shipment) return { ok: false, value: false };
    if (shipment.origin !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    const key = `${shipmentId}-${approver}`;
    if (this.state.approvalsGiven.has(key))
      return { ok: false, value: ERR_APPROVAL_ALREADY_GIVEN };
    const currentApprovers = Array.from(
      this.state.approvalsGiven.keys()
    ).filter((k) => k.startsWith(`${shipmentId}-`)).length;
    if (currentApprovers >= 10)
      return { ok: false, value: ERR_MAX_APPROVERS_EXCEEDED };
    this.state.approvalsGiven.set(key, true);
    return { ok: true, value: true };
  }
  approveShipment(shipmentId: number): Result<boolean> {
    const shipment = this.state.shipments.get(shipmentId);
    if (!shipment) return { ok: false, value: false };
    if (shipment.status !== "active")
      return { ok: false, value: ERR_TRANSFER_INVALID };
    const key = `${shipmentId}-${this.caller}`;
    if (this.state.approvalsGiven.has(key))
      return { ok: false, value: ERR_APPROVAL_ALREADY_GIVEN };
    this.state.approvalsGiven.set(key, true);
    const approvalsCount = Array.from(this.state.approvalsGiven.keys()).filter(
      (k) => k.startsWith(`${shipmentId}-`)
    ).length;
    if (approvalsCount >= 2) {
      shipment.status = "in-transit";
      this.state.shipments.set(shipmentId, shipment);
      return { ok: true, value: true };
    }
    return { ok: true, value: false };
  }
  updateShipmentStatus(
    shipmentId: number,
    newStatus: string,
    geoUpdate: string
  ): Result<boolean> {
    const shipment = this.state.shipments.get(shipmentId);
    if (!shipment) return { ok: false, value: false };
    if (shipment.origin !== this.caller && shipment.destination !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    if (!["active", "in-transit", "delivered", "disputed"].includes(newStatus))
      return { ok: false, value: ERR_INVALID_SHIPMENT_ID };
    if (geoUpdate.length === 0 || geoUpdate.length > 100)
      return { ok: false, value: ERR_INVALID_GEO };
    shipment.status = newStatus;
    this.state.shipments.set(shipmentId, shipment);
    this.state.shipmentUpdates.set(shipmentId, {
      updateGeo: geoUpdate,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }
  completeShipment(shipmentId: number): Result<boolean> {
    const shipment = this.state.shipments.get(shipmentId);
    if (!shipment) return { ok: false, value: false };
    if (shipment.destination !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    if (shipment.status !== "in-transit")
      return { ok: false, value: ERR_TRANSFER_INVALID };
    shipment.status = "delivered";
    this.state.shipments.set(shipmentId, shipment);
    return { ok: true, value: true };
  }
  disputeShipment(shipmentId: number, reason: string): Result<boolean> {
    const shipment = this.state.shipments.get(shipmentId);
    if (!shipment) return { ok: false, value: false };
    if (shipment.origin !== this.caller && shipment.destination !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    shipment.status = "disputed";
    this.state.shipments.set(shipmentId, shipment);
    return { ok: true, value: true };
  }
  getShipmentCount(): Result<number> {
    return { ok: true, value: this.state.lastShipmentId };
  }
  checkShipmentExistence(shipmentId: number): Result<boolean> {
    return { ok: true, value: this.state.shipments.has(shipmentId) };
  }
  getApprovalCount(shipmentId: number): Result<number> {
    const count = Array.from(this.state.approvalsGiven.keys()).filter((k) =>
      k.startsWith(`${shipmentId}-`)
    ).length;
    return { ok: true, value: count };
  }
}
describe("ShipmentTracker", () => {
  let contract: ShipmentTrackerMock;
  beforeEach(() => {
    contract = new ShipmentTrackerMock();
    contract.reset();
  });
  it("initiates a shipment successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.initiateShipment(
      1,
      "ST2DEST",
      1731328000,
      FULL_GEO
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const shipment = contract.getShipment(0);
    expect(shipment?.destination).toBe("ST2DEST");
    expect(shipment?.status).toBe("active");
    expect(contract.stxTransfers).toEqual([
      { amount: 200, from: "ST1ORIGIN", to: "ST2AUTH" },
    ]);
  });
  it("rejects initiation without authority", () => {
    const result = contract.initiateShipment(
      1,
      "ST2DEST",
      1731328000,
      FULL_GEO
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });
  it("rejects invalid origin principal", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.caller = "INVALID";
    const result = contract.initiateShipment(
      1,
      "ST2DEST",
      1731328000,
      FULL_GEO
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ORIGIN);
  });
  it("rejects invalid destination principal", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.initiateShipment(
      1,
      "INVALID",
      1731328000,
      FULL_GEO
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESTINATION);
  });
  it("rejects invalid timestamp", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.initiateShipment(
      1,
      "ST2DEST",
      contract.blockHeight - 1,
      FULL_GEO
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIMESTAMP);
  });
  it("rejects invalid geo", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.initiateShipment(1, "ST2DEST", 1731328000, "");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_GEO);
  });
  it("rejects same origin and destination", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.initiateShipment(
      1,
      "ST1ORIGIN",
      1731328000,
      FULL_GEO
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESTINATION);
  });
  it("adds an approver successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    const result = contract.addApprover(0, "ST3APPROVER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.approvalsGiven.has("0-ST3APPROVER")).toBe(true);
  });
  it("rejects add approver by non-origin", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.caller = "ST4FAKE";
    const result = contract.addApprover(0, "ST3APPROVER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("rejects duplicate approver", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.addApprover(0, "ST3APPROVER");
    const result = contract.addApprover(0, "ST3APPROVER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_APPROVAL_ALREADY_GIVEN);
  });
  it("approves shipment pending with insufficient approvals", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.caller = "ST3APPROVER";
    const result = contract.approveShipment(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
    const shipment = contract.getShipment(0);
    expect(shipment?.status).toBe("active");
  });
  it("rejects approve by already approved", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.addApprover(0, "ST3APPROVER");
    contract.caller = "ST3APPROVER";
    contract.approveShipment(0);
    const result = contract.approveShipment(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_APPROVAL_ALREADY_GIVEN);
  });
  it("updates shipment status successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    const result = contract.updateShipmentStatus(0, "in-transit", "newgeo");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const shipment = contract.getShipment(0);
    expect(shipment?.status).toBe("in-transit");
  });
  it("rejects update by unauthorized", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.caller = "ST4FAKE";
    const result = contract.updateShipmentStatus(0, "in-transit", FULL_GEO);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("rejects invalid status update", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    const result = contract.updateShipmentStatus(0, "invalid", FULL_GEO);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SHIPMENT_ID);
  });
  it("completes shipment successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.caller = "ST2DEST";
    contract.updateShipmentStatus(0, "in-transit", FULL_GEO);
    const result = contract.completeShipment(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const shipment = contract.getShipment(0);
    expect(shipment?.status).toBe("delivered");
  });
  it("rejects complete by non-destination", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.updateShipmentStatus(0, "in-transit", FULL_GEO);
    const result = contract.completeShipment(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("rejects complete on non-in-transit", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.caller = "ST2DEST";
    const result = contract.completeShipment(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TRANSFER_INVALID);
  });
  it("disputes shipment successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    const result = contract.disputeShipment(0, "damage");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const shipment = contract.getShipment(0);
    expect(shipment?.status).toBe("disputed");
  });
  it("rejects dispute by unauthorized", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.caller = "ST4FAKE";
    const result = contract.disputeShipment(0, "damage");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("returns correct shipment count", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.initiateShipment(2, "ST3DEST", 1731328100, FULL_GEO);
    const result = contract.getShipmentCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });
  it("checks shipment existence correctly", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    let result = contract.checkShipmentExistence(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    result = contract.checkShipmentExistence(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
  });
  it("returns correct approval count", () => {
    contract.setAuthorityContract("ST2AUTH");
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    contract.addApprover(0, "ST3APPROVER");
    contract.caller = "ST3APPROVER";
    contract.approveShipment(0);
    const result = contract.getApprovalCount(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });
  it("sets shipment fee successfully", () => {
    contract.setAuthorityContract("ST2AUTH");
    const result = contract.setShipmentFee(300);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.shipmentFee).toBe(300);
    contract.initiateShipment(1, "ST2DEST", 1731328000, FULL_GEO);
    expect(contract.stxTransfers).toEqual([
      { amount: 300, from: "ST1ORIGIN", to: "ST2AUTH" },
    ]);
  });
});
