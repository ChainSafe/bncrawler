import { ENR } from "@chainsafe/discv5";
import { ssz } from "@lodestar/types";
import { DataTypes, Sequelize, ModelAttributes, Model, Options } from "@sequelize/core"

export class Peer extends Model {
  setByENR(enr: ENR): void {
    const eth2Entry = enr.kvs.get("eth2");
    const enrForkID = eth2Entry ? ssz.phase0.ENRForkID.deserialize(eth2Entry) : undefined;
    this.set({
      nodeId: enr.nodeId,
      enr: enr.encode(),
      enrSeq: enr.seq,
      pubkey: enr.publicKey,

      forkDigest: enrForkID?.forkDigest,
      nextForkEpoch: enrForkID?.nextForkEpoch,
      nextForkVersion: enrForkID?.nextForkEpoch,

      attnets: enr.kvs.get("attnets"),
      syncnets: enr.kvs.get("syncnets"),

      ipAddr: enr.kvs.get("ip") ?? enr.kvs.get("ip6"),
      tcpPort: enr.tcp ?? enr.tcp6,
      udpPort: enr.udp ?? enr.udp6,
    })
  }
}

// DB schema is extremely simple, a single table
export const PeerAttributes = {
  lastConnected: {
    type: DataTypes.DATE
  },
  nodeId: {
    type: DataTypes.STRING(64),
    unique: true,
    primaryKey: true,
  },
  pubkey: {
    type: DataTypes.BLOB("medium"),
  },
  enrSeq: {
    type: DataTypes.INTEGER,
  },
  enr: {
    type: DataTypes.BLOB("medium"),
  },

  // User Agent

  userAgentRaw: {
    type: DataTypes.STRING(32),
  },

  // ENRForkID

  forkDigest: {
    type: DataTypes.BLOB("tiny"),
  },
  nextForkEpoch: {
    type: DataTypes.INTEGER,
  },
  nextForkVersion: {
    type: DataTypes.BLOB("tiny"),
  },

  // attnets / syncnets

  attnets: {
    type: DataTypes.BLOB("tiny"),
  },
  syncnets: {
    type: DataTypes.BLOB("tiny"),
  },

  // Connectivity

  ipAddr: {
    type: DataTypes.BLOB("tiny"),
  },
  tcpPort: {
    type: DataTypes.INTEGER,
  },
  udpPort: {
    type: DataTypes.INTEGER,
  },
} satisfies ModelAttributes;

export async function createDb(options: Options): Promise<{ db: Sequelize; Peer: typeof Peer; }> {
  const db = new Sequelize(options);
  Peer.init(PeerAttributes, {sequelize: db, paranoid: true});
  await db.sync();
  return {db, Peer};
}