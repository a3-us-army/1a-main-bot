import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import express from "express";
import {
	Client,
	GatewayIntentBits,
	EmbedBuilder,
	ButtonBuilder,
	ButtonStyle,
	ActionRowBuilder
} from "discord.js";
import {
	setupDatabase,
	resetInventoryForEndedEvents,
} from "./utils/database.js";
import { registerCommands } from "./utils/commandRegistration.js";
import { setupStatusRotation } from "./utils/statusRotation.js";
import { handleButtonInteraction } from "./handlers/buttonHandler.js";
import { sendStartupLog } from "./utils/logger.js";
import { setupReminderSystem } from "./utils/reminderSystem.js";
import { fileURLToPath, pathToFileURL } from "url";
import { buildEventEmbed } from "../utils/rsvp_embed.js";
import { setupFullLogger } from "./utils/discord_logs.js";

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
	console.log(
		chalk.greenBright(`✅ Logged in as ${chalk.bold(client.user.tag)}`),
	);

	// Initialize database and attach it to the client
	client.db = setupDatabase();
	console.log(chalk.cyan("🗄️  Database initialized and attached to client"));

	// Check if we should register commands (using an environment variable)
	const shouldRegisterCommands = process.env.REGISTER_COMMANDS === "true";

	if (shouldRegisterCommands) {
		console.log(chalk.yellow("⚙️  Registering commands..."));
		await registerCommands();
		console.log(chalk.green("✅ Commands registered successfully!"));
	} else {
		console.log(chalk.gray("⏭️  Skipping command registration on startup"));
	}

	// Setup status rotation
	console.log(chalk.blue("🔄 Setting up status rotation..."));
	setupStatusRotation(client);

	// Setup reminder system with client (which now has db attached)
	console.log(chalk.blue("⏰ Setting up reminder system..."));
	setupReminderSystem(client);

	// Send startup log to Discord channel
	console.log(chalk.magenta("📤 Sending startup log to Discord channel..."));
	await sendStartupLog(client);

	setInterval(
		() => {
			console.log(
				chalk.yellow("🔄 Checking for ended events and resetting inventory..."),
			);
			resetInventoryForEndedEvents();
		},
		5 * 60 * 1000,
	);
	setupFullLogger(client, process.env.LOG_CHANNEL_ID);
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
				"../commands/text-commands/textEval.js"
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
					"../commands/events/create-event.js"
				);
				await handleModalSubmit(interaction, client);
			}
			// Handle equipment denial reason modal with updated custom ID format
			else if (interaction.customId.startsWith("deny_r_")) {
				const { handleModalSubmit } = await import(
					"../commands/equipment/equipment-request.js"
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
					"../commands/equipment/equipment-request.js"
				);
				await handleButtonInteraction(interaction);
			}
			// Handle equipment denial buttons with new format
			else if (interaction.customId.startsWith("den_eq_")) {
				const { handleButtonInteraction } = await import(
					"../commands/equipment/equipment-request.js"
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

const apiApp = express();
apiApp.use(express.json());
apiApp.set("discordClient", client);

apiApp.post("/api/post-event", async (req, res) => {
	// Security check
	const authHeader = req.headers.authorization;
	const expected = `Bearer ${process.env.BOT_API_SECRET}`;
	if (authHeader !== expected) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	try {
		const { channelId, event } = req.body;
		if (!channelId || !event) {
			return res.status(400).json({ error: "Missing channelId or event" });
		}

		const channel = await client.channels.fetch(channelId);
		if (!channel || !channel.isTextBased()) {
			return res
				.status(404)
				.json({ error: "Channel not found or not text-based" });
		}

		// Use the same embed as the Discord command
		const { embed, components } = buildEventEmbed(event);
		const message = await channel.send({ embeds: [embed], components });
		res.json({ messageId: message.id });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "Failed to post event" });
	}
});

const BOT_API_PORT = process.env.BOT_API_PORT || 3001;
apiApp.listen(BOT_API_PORT, () => {
	console.log(`Bot REST API running on port ${BOT_API_PORT}`);
});

apiApp.get("/api/channels", async (req, res) => {
	const authHeader = req.headers.authorization;
	const expected = `Bearer ${process.env.BOT_API_SECRET}`;
	if (authHeader !== expected) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	try {
		const guild = await client.guilds.fetch(process.env.GUILD_ID);
		const fullGuild = await guild.fetch();
		const channels = await fullGuild.channels.fetch();

		const categories = [];
		const textChannels = [];

		for (const [, channel] of channels) {
			if (channel.type === 4) {
				// Category
				categories.push({ id: channel.id, name: channel.name });
			} else if (channel.type === 0) {
				// Text
				textChannels.push({
					id: channel.id,
					name: channel.name,
					parentId: channel.parentId,
				});
			}
		}

		res.json({ categories, textChannels });
	} catch (err) {
		console.error("Failed to fetch channels:", err);
		res.status(500).json({ error: "Failed to fetch channels" });
	}
});

apiApp.post("/api/delete-message", async (req, res) => {
	const authHeader = req.headers.authorization;
	const expected = `Bearer ${process.env.BOT_API_SECRET}`;
	if (authHeader !== expected) {
		return res.status(401).json({ error: "Unauthorized" });
	}
	const { channelId, messageId } = req.body;
	if (!channelId || !messageId) {
		return res.status(400).json({ error: "Missing channelId or messageId" });
	}
	try {
		const channel = await client.channels.fetch(channelId);
		if (!channel || !channel.isTextBased()) {
			return res
				.status(404)
				.json({ error: "Channel not found or not text-based" });
		}
		const message = await channel.messages.fetch(messageId);
		await message.delete();
		res.json({ success: true });
	} catch (err) {
		console.error("Failed to delete message:", err);
		res.status(500).json({ error: "Failed to delete message" });
	}
});

apiApp.post("/api/request-cert", async (req, res) => {
	const authHeader = req.headers.authorization;
	const expected = `Bearer ${process.env.BOT_API_SECRET}`;
	if (authHeader !== expected) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	try {
		const { userId, cert, requestId } = req.body;
		const channelId = process.env.CERT_REQUEST_CHANNEL_ID;
		if (!userId || !cert || !channelId) {
			return res.status(400).json({ error: "Missing data" });
		}

		const client = req.app.get("discordClient") || global.discordClient; // however you access your client
		const channel = await client.channels.fetch(channelId);
		if (!channel?.isTextBased()) {
			return res.status(404).json({ error: "Channel not found" });
		}

		const embed = new EmbedBuilder()
			.setTitle("Certification Request")
			.setDescription(`User: <@${userId}>`)
			.addFields(
				{ name: "Certification", value: cert.name, inline: true },
				{
					name: "Description",
					value: cert.description || "No description",
					inline: false,
				},
				{
					name: "Requested At",
					value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
					inline: true,
				},
				{ name: "Request ID", value: requestId, inline: true },
			)
			.setColor(0xffa500);

		const approveBtn = new ButtonBuilder()
			.setCustomId(`cert_approve_${requestId}`)
			.setLabel("Approve")
			.setStyle(ButtonStyle.Success);

		const denyBtn = new ButtonBuilder()
			.setCustomId(`cert_deny_${requestId}`)
			.setLabel("Deny")
			.setStyle(ButtonStyle.Danger);

		const row = new ActionRowBuilder().addComponents(approveBtn, denyBtn);

		await channel.send({ embeds: [embed], components: [row] });

		res.json({ success: true });
	} catch (err) {
		console.error("Error posting cert request to Discord:", err);
		res.status(500).json({ error: "Failed to post to Discord" });
	}
});
