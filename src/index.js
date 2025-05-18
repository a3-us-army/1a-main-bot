import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { setupDatabase } from "./utils/database.js";
import { registerCommands } from "./utils/commandRegistration.js";
import { setupStatusRotation } from "./utils/statusRotation.js";
import { handleButtonInteraction } from "./handlers/buttonHandler.js";
import { sendStartupLog } from "./utils/logger.js";
import { setupReminderSystem } from "./utils/reminderSystem.js";

// Load environment variables
dotenv.config();

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
	client.db = await setupDatabase();
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
			// Import and execute the eval handler
			const { handleEval } = await import("./commands/text-commands/textEval.js");
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
			// Dynamically import the command module
			const commandModule = await import(`./commands/${commandName}.js`);
			// Pass client to the command execution
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
			// Dynamically import the command module
			const commandModule = await import(`./commands/${commandName}.js`);

			// Check if the module has an autocomplete function
			if (commandModule.autocomplete) {
				await commandModule.autocomplete(interaction, client);
			}
		} catch (error) {
			console.error(`Error handling autocomplete for ${commandName}:`, error);
			// For autocomplete, we don't send error messages to the user
			// Just log the error and let the autocomplete fail silently
		}
	}

	// Handle modal submissions
	if (
		interaction.isModalSubmit() &&
		interaction.customId === "create_event_modal"
	) {
		try {
			const { handleModalSubmit } = await import("./commands/create-event.js");
			await handleModalSubmit(interaction, client);
		} catch (error) {
			console.error("Error handling modal submit:", error);
			if (!interaction.replied && !interaction.deferred) {
				await interaction.reply({
					content: "There was an error processing your event.",
					ephemeral: true,
				});
			}
		}
	}

	// Handle button interactions
	if (interaction.isButton()) {
		if (interaction.customId.startsWith("rsvp_")) {
			await handleButtonInteraction(interaction, client);
		} else if (interaction.customId.startsWith("delete_event_")) {
			await handleButtonInteraction(interaction, client);
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
