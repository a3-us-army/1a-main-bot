import { SlashCommandBuilder, REST, Routes } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to get all command definitions
export async function getAllCommands() {
	const commands = [];
	const commandsPath = path.join(__dirname, "commands");

	try {
		// Get all command files
		const commandFiles = fs
			.readdirSync(commandsPath)
			.filter((file) => file.endsWith(".js"));

		// Process each command file
		for (const file of commandFiles) {
			try {
				// Get command name (filename without extension)
				const commandName = file.replace(".js", "");

				// Import the command module
				const commandModule = await import(`./commands/${file}`);

				// If the command has a data property, add it to commands array
				if (commandModule.data) {
					commands.push(commandModule.data.toJSON());
				} else {
					// Use default naming convention if no data property exists
					commands.push(
						new SlashCommandBuilder()
							.setName(commandName.replace(/([A-Z])/g, "-$1").toLowerCase())
							.setDescription(`${commandName} command`)
							.toJSON(),
					);
				}
			} catch (error) {
				console.error(`Error loading command from file ${file}:`, error);
			}
		}
	} catch (error) {
		console.error("Error reading commands directory:", error);
	}

	return commands;
}

// Register all commands with Discord API
export async function registerCommands() {
	// Load all command definitions
	const commands = await getAllCommands();

	// Manually add specific commands if needed
	// This is useful for commands that require special configuration
	if (commands.length === 0) {
		commands.push(
			new SlashCommandBuilder()
				.setName("create-event")
				.setDescription("Create a new event.")
				.toJSON(),
		);
	}

	const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

	try {
		console.log(`Starting to register ${commands.length} slash commands...`);

		// Register global commands with Discord API
		const data = await rest.put(
			Routes.applicationCommands(process.env.CLIENT_ID),
			{ body: commands },
		);

		console.log(`Successfully registered ${data.length} slash commands.`);
		return data;
	} catch (error) {
		console.error("Error registering slash commands:", error);
		throw error;
	}
}