import "dotenv/config";
import { z } from "zod";
import { createKyselyDb, openDatabase } from "../../adapters/sqlite/connection.js";
import { createSqliteChannelRepository } from "../../adapters/sqlite/channel-repository.js";
import { parseChannelIdentifier } from "../../modules/ingestion/domain/channel-identifier.js";
import { createIngestionUseCases } from "../../modules/ingestion/application/use-cases.js";

const rawSchema = z.object({
  DATABASE_PATH: z.string().default("./data/telesift.sqlite3"),
});

const COMMANDS = ["add", "enable", "disable", "list"] as const;
type Command = (typeof COMMANDS)[number];

const USAGE = "Usage: manage-channels <add|enable|disable|list> [identifier]";

function isCommand(value: string | undefined): value is Command {
  return COMMANDS.includes(value as Command);
}

async function main(): Promise<void> {
  const [command, identifierRaw] = process.argv.slice(2);
  if (!isCommand(command)) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  if (command !== "list" && !identifierRaw) {
    console.error(`Missing identifier.\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  const config = rawSchema.parse(process.env);
  const kysely = createKyselyDb(openDatabase(config.DATABASE_PATH));
  try {
    const useCases = createIngestionUseCases(createSqliteChannelRepository(kysely));

    if (command === "list") {
      console.log(JSON.stringify(await useCases.listChannels(), null, 2));
      return;
    }

    const identifier = parseChannelIdentifier(identifierRaw!);
    const result =
      command === "add"
        ? await useCases.addChannel(identifier)
        : command === "enable"
          ? await useCases.enableChannel(identifier)
          : await useCases.disableChannel(identifier);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await kysely.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
