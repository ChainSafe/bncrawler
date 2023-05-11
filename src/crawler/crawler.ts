import { Discv5, ENR, ENRInput, IDiscv5CreateOptions } from "@chainsafe/discv5";

export type CrawlerInitOptions = {
  discv5: IDiscv5CreateOptions;
  bootEnrs: ENRInput[];
};

export type CrawlerConstructorOptions = {
  opts: CrawlerInitOptions;
  discv5: Discv5;
}

/**
 * Amount of time since last update to trigger a refresh
 *
 * 6 hrs
 */
export const PEER_REFRESH_TIMEOUT = 6 * 1000 * 60 * 6;

export const PING_INTERVAL = 60_000;

export type ENRValue = {
  enr: ENR;
  lastUpdate: number;
}

export class Crawler {
  public discovered: Map<string, ENRValue>;
  public ips: string[];
  private opts: CrawlerInitOptions;
  private discv5: Discv5;
  private pingTimer: NodeJS.Timer;
  private stopped = false;

  constructor(modules: CrawlerConstructorOptions) {
    this.opts = modules.opts;
    this.discv5 = modules.discv5;
    this.discovered = new Map();
    this.ips = [];
    this.discv5.on("discovered", this.onDiscovered);

    this.crawl().catch((e) => console.error("error crawling", e))

    this.pingTimer = setInterval(() => this.pingDiscoveredPeers(), PING_INTERVAL);
  }

  static async init(opts: CrawlerInitOptions): Promise<Crawler> {
    const discv5 = Discv5.create(opts.discv5);
    for (const bootEnr of opts.bootEnrs) {
      discv5.addEnr(bootEnr);
    }

    await discv5.start();

    return new Crawler({
      opts, discv5,
    })
  }

  async crawl(): Promise<void> {
    while (!this.stopped) {
      await this.discv5.findRandomNode();
    }
  }

  onDiscovered = (enr: ENR) => {
    if (enr.ip) {
      // Dedupe Ips
      if (!this.ips.includes(enr.ip)) {
        this.ips.push(enr.ip);
        this.discovered.set(enr.nodeId, {enr, lastUpdate: 0});
      }
    } else {
      console.log("discovered peer without ip", enr.nodeId);
    }
  };

  async pingDiscoveredPeers() {
    const toPing: ENR[] = []
    const now = Date.now()
    const updateThreshold = Date.now() - PEER_REFRESH_TIMEOUT;
    for (const {enr, lastUpdate} of this.discovered.values()) {
      if (lastUpdate < updateThreshold) {
        toPing.push(enr);
      }
    }
    await Promise.all(toPing.map((enr) => this.pingENR(enr).then((newEnr) => {
      if (newEnr) {
        this.discovered.set(newEnr.nodeId, {enr: newEnr, lastUpdate: now});
      }
    }))).catch(e => {
      console.error("error pinging discovered peers", e)
    })
  }

  /**
   * Ping an enr and update it, returning the newest available ENR or undefined if either response fails
   */
  async pingENR(enr: ENR): Promise<ENR | undefined> {
    try {
      const pong = await this.discv5.sendPing(enr);
      if (pong.enrSeq > enr.seq) {
        const [newENR] = await this.discv5.sendFindNode(enr, [0]);
        return newENR;
      }
      return enr;
    } catch (e) {
      return undefined;
    }
  }

  async close(): Promise<void> {
    this.stopped = true;
    clearInterval(this.pingTimer);

    await this.discv5.stop();
    this.discv5.off("discovered", this.onDiscovered);
  }
}
