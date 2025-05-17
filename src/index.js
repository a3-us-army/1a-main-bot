import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { setupDatabase } from "./database.js";
import { registerCommands } from "./commandRegistration.js";
import { setupStatusRotation } from "./utils/statusRotation.js";
import { handleButtonInteraction } from "./handlers/buttonHandler.js";

// Load environment variables
dotenv.config();

// Setup database
setupDatabase();

// Initialize Discord client
const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});

// Handle ready event
client.once("ready", async () => {
	console.log(`Logged in as ${client.user.tag}`);

	// Register slash commands
	await registerCommands();

	// Setup status rotation
	setupStatusRotation(client);
});

// Handle interactions
client.on("interactionCreate", async (interaction) => {
	// Handle slash commands
	if (interaction.isCommand()) {
		const { commandName } = interaction;

		try {
			// Dynamically import the command module
			const commandModule = await import(`./commands/${commandName}.js`);
			await commandModule.execute(interaction);
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

	// Handle modal submissions
	if (
		interaction.isModalSubmit() &&
		interaction.customId === "create_event_modal"
	) {
		try {
			const { handleModalSubmit } = await import("./commands/createEvent.js");
			await handleModalSubmit(interaction);
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
	if (interaction.isButton() && interaction.customId.startsWith("rsvp_")) {
		await handleButtonInteraction(interaction);
	}
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);