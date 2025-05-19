import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import {
	setupDatabase,
	resetInventoryForEndedEvents,
} from "./utils/database.js";
import { registerCommands } from "./utils/commandRegistration.js";
import { setupStatusRotation } from "./utils/statusRotation.js";
import { handleButtonInteraction } from "./handlers/buttonHandler.js";
import { sendStartupLog } from "./utils/logger.js";
import { setupReminderSystem } from "./utils/reminderSystem.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper: recursively find a command file by name
function findCommandFile(commandsDir, commandName) {
	const files = fs.readdirSync(commandsDir);
	for (const file of files) {
		const filePath = path.join(commandsDir, file);
		const stat = fs.statSync(filePath);
		if (stat.isDirectory()) {
			const found = findCommandFile(filePath, commandName);
			if (found) return found;
		} else if (
			stat.isFile() &&
			file.endsWith(".js") &&
			file.replace(/\.js$/, "") === commandName
		) {
			return filePath;
		}
	}
	return null;
}

// Initialize Discord client
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

// Handle ready event
client.once("ready", async () => {
	console.log(`Logged in as ${client.user.tag}`);

	// Initialize database and attach it to the client
	client.db = setupDatabase();
	console.log("Database initialized and attached to client");

	// Check if we should register commands (using an environment variable)
	const shouldRegisterCommands = process.env.REGISTER_COMMANDS === "true";

	if (shouldRegisterCommands) {
		console.log("Registering commands...");
		await registerCommands();
		console.log("Commands registered successfully!");
	} else {
		console.log("Skipping command registration on startup");
	}

	// Setup status rotation
	setupStatusRotation(client);

	// Setup reminder system with client (which now has db attached)
	setupReminderSystem(client);

	// Send startup log to Discord channel
	await sendStartupLog(client);

	setInterval(
		() => {
			console.log("Checking for ended events and resetting inventory...");
			resetInventoryForEndedEvents();
		},
		5 * 60 * 1000,
	);
});

// Handle message events for eval command
client.on("messageCreate", async (message) => {
	// Ignore messages from bots
	if (message.author.bot) return;

	// Check if the message starts with a mention of the bot
	const mentionPrefix = `<@${client.user.id}>`;
	if (!message.content.startsWith(mentionPrefix)) return;

	// Get the command content after the mention
	const content = message.content.slice(mentionPrefix.length).trim();

	// Check if it's an eval command
	if (content.startsWith("eval")) {
		try {
			const { handleEval } = await import(
				"./commands/text-commands/textEval.js"
			);
			await handleEval(message, content.slice(4).trim(), client);
		} catch (error) {
			console.error("Error handling eval command:", error);
			await message.reply(
				"An error occurred while processing the eval command.",
			);
		}
	}
});

// Handle interactions
client.on("interactionCreate", async (interaction) => {
	// Handle slash commands
	if (interaction.isCommand()) {
		const { commandName } = interaction;
		try {
			const commandsDir = path.join(__dirname, "commands");
			const filePath = findCommandFile(commandsDir, commandName);
			if (!filePath)
				throw new Error(`Command file for "${commandName}" not found.`);
			const commandModule = await import(pathToFileURL(filePath).href);
			await commandModule.execute(interaction, client);
		} catch (error) {
			console.error(`Error executing command ${commandName}:`, error);
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({
					content: "There was an error executing this command.",
					ephemeral: true,
				});
			}
		}
	}

	// Handle autocomplete interactions
	if (interaction.isAutocomplete()) {
		const { commandName } = interaction;
		try {
			const commandsDir = path.join(__dirname, "commands");
			const filePath = findCommandFile(commandsDir, commandName);
			if (!filePath)
				throw new Error(`Command file for "${commandName}" not found.`);
			const commandModule = await import(pathToFileURL(filePath).href);
			if (commandModule.autocomplete) {
				await commandModule.autocomplete(interaction, client);
			}
		} catch (error) {
			console.error(`Error handling autocomplete for ${commandName}:`, error);
		}
	}

	// Handle modal submissions
	if (interaction.isModalSubmit()) {
		try {
			if (interaction.customId === "create_event_modal") {
				const { handleModalSubmit } = await import(
					"./commands/events/create-event.js"
				);
				await handleModalSubmit(interaction, client);
			}
			// Handle equipment denial reason modal with updated custom ID format
			else if (interaction.customId.startsWith("deny_r_")) {
				const { handleModalSubmit } = await import(
					"./commands/equipment/equipment-request.js"
				);
				await handleModalSubmit(interaction);
			}
			// Handle cert denial modal
			else if (interaction.customId.startsWith("cert_deny_modal_")) {
				const { handleModalSubmit } = await import(
					"./handlers/buttonHandler.js"
				);
				await handleModalSubmit(interaction);
			}
		} catch (error) {
			console.error("Error handling modal submit:", error);
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({
					content: "There was an error processing your submission.",
					ephemeral: true,
				});
			}
		}
	}

	// Handle button interactions
	if (interaction.isButton()) {
		try {
			// Route all these button types to your main button handler
			if (
				interaction.customId.startsWith("rsvp_") ||
				interaction.customId.startsWith("delete_event_") ||
				interaction.customId.startsWith("check_equipment_") ||
				interaction.customId.startsWith("cert_approve_") ||
				interaction.customId.startsWith("cert_deny_")
			) {
				await handleButtonInteraction(interaction, client);
			}
			// Handle equipment approval buttons with new format
			else if (interaction.customId.startsWith("app_eq_")) {
				const { handleButtonInteraction } = await import(
					"./commands/equipment/equipment-request.js"
				);
				await handleButtonInteraction(interaction);
			}
			// Handle equipment denial buttons with new format
			else if (interaction.customId.startsWith("den_eq_")) {
				const { handleButtonInteraction } = await import(
					"./commands/equipment/equipment-request.js"
				);
				await handleButtonInteraction(interaction);
			}
		} catch (error) {
			console.error("Error handling button interaction:", error);
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({
					content: "There was an error processing your interaction.",
					ephemeral: true,
				});
			}
		}
	}
});

// Add global error handlers to log errors to Discord
process.on("unhandledRejection", async (error) => {
	console.error("Unhandled promise rejection:", error);
	// If you implement sendErrorLog, you can use it here
	// await sendErrorLog(client, error, { type: 'Unhandled Rejection' });
});

process.on("uncaughtException", async (error) => {
	console.error("Uncaught exception:", error);
	// If you implement sendErrorLog, you can use it here
	// await sendErrorLog(client, error, { type: 'Uncaught Exception' });
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
