import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";
const ERR_UNAUTHORIZED = 1000;
const ERR_BATCH_EXISTS = 1001;
const ERR_INVALID_HASH = 1002;
const ERR_INVALID_DATE = 1003;
const ERR_INVALID_TITLE = 1004;
const ERR_INVALID_DESC = 1005;
const ERR_INVALID_BATCH_SIZE = 1006;
const ERR_INVALID_CERT_BODY = 1007;
const ERR_INVALID_GEO = 1008;
const ERR_INVALID_QUALITY = 1009;
const ERR_CERT_NOT_FOUND = 1010;
const ERR_UNCERTIFIED_BATCH = 1011;
const ERR_EXPIRED_CERT = 1012;
const ERR_MAX_BATCHES_EXCEEDED = 1013;
const ERR_INVALID_FEE = 1014;
const ERR_AUTHORITY_NOT_SET = 1015;
const ERR_INVALID_UPDATE = 1016;
const ERR_TRANSFER_FAILED = 1017;
const FULL_HASH =
  "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456";
const FULL_CERT_HASH =
  "b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678";
interface Batch {
  hash: string;
  title: string;
  description: string;
  harvestDate: number;
  batchSize: number;
  certBody: string;
  geoLocation: string;
  qualityMetric: number;
  farmer: string;
  certified: boolean;
  certExpiry: number;
  createdAt: number;
  status: boolean;
}
interface Certification {
  certHash: string;
  issuedDate: number;
  expiryDate: number;
  issuer: string;
}
interface BatchUpdate {
  updateTitle: string;
  updateDesc: string;
  updateTimestamp: number;
  updater: string;
}
interface Result<T> {
  ok: boolean;
  value: T;
}
class ProductRegistryMock {
  state: {
    lastBatchId: number;
    totalRegistrations: number;
    maxBatches: number;
    registrationFee: number;
    authorityContract: string | null;
    batches: Map<number, Batch>;
    batchOwners: Map<string, string>;
    certifications: Map<number, Certification>;
    batchUpdates: Map<number, BatchUpdate>;
  } = {
    lastBatchId: 0,
    totalRegistrations: 0,
    maxBatches: 5000,
    registrationFee: 500,
    authorityContract: null,
    batches: new Map(),
    batchOwners: new Map(),
    certifications: new Map(),
    batchUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  constructor() {
    this.reset();
  }
  reset() {
    this.state = {
      lastBatchId: 0,
      totalRegistrations: 0,
      maxBatches: 5000,
      registrationFee: 500,
      authorityContract: null,
      batches: new Map(),
      batchOwners: new Map(),
      certifications: new Map(),
      batchUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }
  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }
  setMaxBatches(newMax: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxBatches = newMax;
    return { ok: true, value: true };
  }
  setRegistrationFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newFee < 0) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }
  registerBatch(
    hash: string,
    title: string,
    description: string,
    harvestDate: number,
    batchSize: number,
    certBody: string,
    geoLocation: string,
    qualityMetric: number
  ): Result<number> {
    if (this.state.lastBatchId >= this.state.maxBatches)
      return { ok: false, value: ERR_MAX_BATCHES_EXCEEDED };
    if (hash.length !== 64) return { ok: false, value: ERR_INVALID_HASH };
    if (title.length === 0 || title.length > 100)
      return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length === 0 || description.length > 500)
      return { ok: false, value: ERR_INVALID_DESC };
    if (harvestDate <= 0) return { ok: false, value: ERR_INVALID_DATE };
    if (batchSize <= 0 || batchSize > 10000)
      return { ok: false, value: ERR_INVALID_BATCH_SIZE };
    if (certBody.length === 0 || certBody.length > 50)
      return { ok: false, value: ERR_INVALID_CERT_BODY };
    if (geoLocation.length === 0 || geoLocation.length > 100)
      return { ok: false, value: ERR_INVALID_GEO };
    if (qualityMetric > 100) return { ok: false, value: ERR_INVALID_QUALITY };
    const nextId = this.state.lastBatchId;
    const idKey = `${nextId}-0`;
    if (this.state.batches.has(nextId))
      return { ok: false, value: ERR_BATCH_EXISTS };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    this.stxTransfers.push({
      amount: this.state.registrationFee,
      from: this.caller,
      to: this.state.authorityContract,
    });
    const batch: Batch = {
      hash,
      title,
      description,
      harvestDate,
      batchSize,
      certBody,
      geoLocation,
      qualityMetric,
      farmer: this.caller,
      certified: false,
      certExpiry: 0,
      createdAt: this.blockHeight,
      status: true,
    };
    this.state.batches.set(nextId, batch);
    this.state.batchOwners.set(idKey, this.caller);
    this.state.lastBatchId++;
    this.state.totalRegistrations++;
    return { ok: true, value: nextId };
  }
  getBatch(id: number): Batch | null {
    return this.state.batches.get(id) || null;
  }
  certifyBatch(id: number, certHash: string, expiry: number): Result<boolean> {
    const batch = this.state.batches.get(id);
    if (!batch) return { ok: false, value: false };
    if (batch.certified) return { ok: false, value: ERR_UNCERTIFIED_BATCH };
    if (certHash.length !== 64) return { ok: false, value: ERR_INVALID_HASH };
    if (expiry <= this.blockHeight)
      return { ok: false, value: ERR_EXPIRED_CERT };
    batch.certified = true;
    batch.certExpiry = expiry;
    this.state.batches.set(id, batch);
    this.state.certifications.set(id, {
      certHash,
      issuedDate: this.blockHeight,
      expiryDate: expiry,
      issuer: this.caller,
    });
    return { ok: true, value: true };
  }
  revokeCertification(id: number): Result<boolean> {
    const batch = this.state.batches.get(id);
    const cert = this.state.certifications.get(id);
    if (!batch || !cert) return { ok: false, value: false };
    if (cert.issuer !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    if (!batch.certified) return { ok: false, value: ERR_UNCERTIFIED_BATCH };
    batch.certified = false;
    batch.certExpiry = 0;
    this.state.batches.set(id, batch);
    this.state.certifications.delete(id);
    return { ok: true, value: true };
  }
  updateBatch(
    id: number,
    updateTitle: string,
    updateDesc: string
  ): Result<boolean> {
    const batch = this.state.batches.get(id);
    if (!batch) return { ok: false, value: false };
    if (batch.farmer !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    if (updateTitle.length === 0 || updateTitle.length > 100)
      return { ok: false, value: ERR_INVALID_TITLE };
    if (updateDesc.length === 0 || updateDesc.length > 500)
      return { ok: false, value: ERR_INVALID_DESC };
    batch.title = updateTitle;
    batch.description = updateDesc;
    this.state.batches.set(id, batch);
    this.state.batchUpdates.set(id, {
      updateTitle,
      updateDesc,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }
  transferOwnership(id: number, newOwner: string): Result<boolean> {
    const batch = this.state.batches.get(id);
    if (!batch) return { ok: false, value: false };
    if (batch.farmer !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    if (!batch.status) return { ok: false, value: ERR_INVALID_UPDATE };
    const ownerCount = Array.from(this.state.batchOwners.keys()).filter((k) =>
      k.startsWith(`${id}-`)
    ).length;
    const newIndex = ownerCount;
    const newKey = `${id}-${newIndex}`;
    this.state.batchOwners.set(newKey, newOwner);
    batch.farmer = newOwner;
    this.state.batches.set(id, batch);
    return { ok: true, value: true };
  }
  deactivateBatch(id: number): Result<boolean> {
    const batch = this.state.batches.get(id);
    if (!batch) return { ok: false, value: false };
    if (batch.farmer !== this.caller)
      return { ok: false, value: ERR_UNAUTHORIZED };
    batch.status = false;
    this.state.batches.set(id, batch);
    return { ok: true, value: true };
  }
  getBatchCount(): Result<number> {
    return { ok: true, value: this.state.lastBatchId };
  }
  checkBatchExistence(id: number): Result<boolean> {
    return { ok: true, value: this.state.batches.has(id) };
  }
  checkCertStatus(id: number): Result<boolean> {
    const batch = this.state.batches.get(id);
    const cert = this.state.certifications.get(id);
    if (
      !batch ||
      !cert ||
      !batch.certified ||
      this.blockHeight > cert.expiryDate
    ) {
      return { ok: false, value: ERR_EXPIRED_CERT };
    }
    return { ok: true, value: true };
  }
}
describe("ProductRegistry", () => {
  let contract: ProductRegistryMock;
  beforeEach(() => {
    contract = new ProductRegistryMock();
    contract.reset();
  });
  it("registers a batch successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerBatch(
      FULL_HASH,
      "Organic Kale Batch",
      "Harvested in Oregon farm",
      1731328000,
      1000,
      "USDA",
      "45.5231,-122.6765",
      95
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const batch = contract.getBatch(0);
    expect(batch?.title).toBe("Organic Kale Batch");
    expect(batch?.batchSize).toBe(1000);
    expect(batch?.certified).toBe(false);
    expect(contract.stxTransfers).toEqual([
      { amount: 500, from: "ST1TEST", to: "ST2TEST" },
    ]);
  });
  it("rejects registration without authority", () => {
    const result = contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });
  it("rejects invalid hash length", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerBatch(
      "short",
      "Batch1",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });
  it("rejects invalid title length", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerBatch(
      FULL_HASH,
      "",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });
  it("rejects invalid description length", () => {
    contract.setAuthorityContract("ST2TEST");
    const longDesc = "x".repeat(501);
    const result = contract.registerBatch(
      FULL_HASH,
      "Batch1",
      longDesc,
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DESC);
  });
  it("rejects invalid harvest date", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      0,
      1000,
      "USDA",
      "geo1",
      95
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DATE);
  });
  it("rejects invalid batch size", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      1731328000,
      0,
      "USDA",
      "geo1",
      95
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_BATCH_SIZE);
  });
  it("certifies a batch successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    const result = contract.certifyBatch(0, FULL_CERT_HASH, 200000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const batch = contract.getBatch(0);
    expect(batch?.certified).toBe(true);
    expect(batch?.certExpiry).toBe(200000);
  });
  it("rejects certification of already certified batch", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    contract.certifyBatch(0, FULL_CERT_HASH, 200000);
    const result = contract.certifyBatch(0, FULL_CERT_HASH + "1", 300000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNCERTIFIED_BATCH);
  });
  it("rejects certification with invalid expiry", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    const result = contract.certifyBatch(
      0,
      FULL_CERT_HASH,
      contract.blockHeight - 1
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_EXPIRED_CERT);
  });
  it("rejects revocation by non-issuer", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    contract.certifyBatch(0, FULL_CERT_HASH, 200000);
    contract.caller = "ST3FAKE";
    const result = contract.revokeCertification(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("updates a batch successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "OldTitle",
      "OldDesc",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    const result = contract.updateBatch(0, "NewTitle", "NewDesc");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const batch = contract.getBatch(0);
    expect(batch?.title).toBe("NewTitle");
    expect(batch?.description).toBe("NewDesc");
  });
  it("rejects update by non-farmer", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Title",
      "Desc",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateBatch(0, "NewTitle", "NewDesc");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("transfers ownership successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Title",
      "Desc",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    const result = contract.transferOwnership(0, "ST2NEW");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const batch = contract.getBatch(0);
    expect(batch?.farmer).toBe("ST2NEW");
  });
  it("rejects transfer by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Title",
      "Desc",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    contract.caller = "ST3FAKE";
    const result = contract.transferOwnership(0, "ST2NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });
  it("deactivates a batch successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Title",
      "Desc",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    const result = contract.deactivateBatch(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const batch = contract.getBatch(0);
    expect(batch?.status).toBe(false);
  });
  it("checks batch existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    let result = contract.checkBatchExistence(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    result = contract.checkBatchExistence(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
  });
  it("checks certification status correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    contract.certifyBatch(0, FULL_CERT_HASH, 200000);
    const result = contract.checkCertStatus(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });
  it("rejects expired certification status", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    contract.certifyBatch(0, FULL_CERT_HASH, contract.blockHeight - 1);
    const result = contract.checkCertStatus(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_EXPIRED_CERT);
  });
  it("sets registration fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registrationFee).toBe(1000);
    contract.registerBatch(
      FULL_HASH,
      "Batch1",
      "Desc1",
      1731328000,
      1000,
      "USDA",
      "geo1",
      95
    );
    expect(contract.stxTransfers).toEqual([
      { amount: 1000, from: "ST1TEST", to: "ST2TEST" },
    ]);
  });
});
