import { describe, expect, it } from "vitest";
import { ChannelNotFoundError, type Channel, type ChannelIdentifier } from "../domain/channel.js";
import type { ChannelRepository } from "../ports/channel-repository.js";
import { createIngestionUseCases } from "./use-cases.js";

function sameIdentifier(a: ChannelIdentifier, b: ChannelIdentifier): boolean {
  return a.type === b.type && a.value === b.value;
}

function createFakeChannelRepository(): ChannelRepository {
  const channels: Channel[] = [];
  let nextId = 1;

  return {
    async add(identifier) {
      const existing = channels.find((channel) => sameIdentifier(channel.identifier, identifier));
      if (existing) return existing;
      const now = Date.now();
      const created: Channel = { id: nextId++, identifier, enabled: true, createdAt: now, updatedAt: now };
      channels.push(created);
      return created;
    },

    async setEnabled(identifier, enabled) {
      const channel = channels.find((entry) => sameIdentifier(entry.identifier, identifier));
      if (!channel) throw new ChannelNotFoundError(identifier);
      channel.enabled = enabled;
      channel.updatedAt = Date.now();
      return channel;
    },

    async list() {
      return [...channels];
    },
  };
}

describe("ingestion use-cases", () => {
  it("adds a new channel as enabled", async () => {
    const useCases = createIngestionUseCases(createFakeChannelRepository());

    const channel = await useCases.addChannel({ type: "username", value: "somechannel" });

    expect(channel).toMatchObject({ identifier: { type: "username", value: "somechannel" }, enabled: true });
  });

  it("adding the same identifier twice is idempotent", async () => {
    const useCases = createIngestionUseCases(createFakeChannelRepository());
    const identifier: ChannelIdentifier = { type: "telegram_id", value: "123" };

    const first = await useCases.addChannel(identifier);
    const second = await useCases.addChannel(identifier);

    expect(second).toEqual(first);
    expect(await useCases.listChannels()).toHaveLength(1);
  });

  it("disables and re-enables a channel without removing it", async () => {
    const useCases = createIngestionUseCases(createFakeChannelRepository());
    const identifier: ChannelIdentifier = { type: "username", value: "somechannel" };
    await useCases.addChannel(identifier);

    const disabled = await useCases.disableChannel(identifier);
    expect(disabled.enabled).toBe(false);
    expect(await useCases.listChannels()).toHaveLength(1);

    const reenabled = await useCases.enableChannel(identifier);
    expect(reenabled.enabled).toBe(true);
  });

  it("throws ChannelNotFoundError when enabling an unknown channel", async () => {
    const useCases = createIngestionUseCases(createFakeChannelRepository());

    await expect(useCases.enableChannel({ type: "username", value: "missing" })).rejects.toThrow(
      ChannelNotFoundError,
    );
  });

  it("lists every added channel", async () => {
    const useCases = createIngestionUseCases(createFakeChannelRepository());
    await useCases.addChannel({ type: "username", value: "a" });
    await useCases.addChannel({ type: "telegram_id", value: "1" });

    expect(await useCases.listChannels()).toHaveLength(2);
  });
});
