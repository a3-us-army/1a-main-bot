const {
	Client,
	GatewayIntentBits,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	EmbedBuilder,
	SlashCommandBuilder,
	REST,
	Routes,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const Database = require("better-sqlite3");
require("dotenv").config();

const db = new Database("events.db");

// Ensure the events table has the necessary columns
db.prepare(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    creator_id TEXT,
    title TEXT,
    description TEXT,
    time TEXT,
    duration TEXT,
    image TEXT,
    message_id TEXT,
    channel_id TEXT
  )
`).run();

// Auto-migrate: Ensure required columns exist in the 'events' table
const requiredColumns = {
	id: "TEXT PRIMARY KEY",
	creator_id: "TEXT",
	title: "TEXT",
	description: "TEXT",
	time: "TEXT",
	duration: "TEXT",
	image: "TEXT",
	message_id: "TEXT",
	channel_id: "TEXT",
};

// Get current columns in the table
const existingColumns = db
	.prepare("PRAGMA table_info(events)")
	.all()
	.map((col) => col.name);

// Add missing columns
for (const [column, type] of Object.entries(requiredColumns)) {
	if (!existingColumns.includes(column)) {
		console.log(`Adding missing column '${column}' to 'events' table...`);
		db.prepare(`ALTER TABLE events ADD COLUMN ${column} ${type}`).run();
	}
}

// Ensure RSVP table exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS rsvps (
    event_id TEXT,
    user_id TEXT,
    status TEXT,
    PRIMARY KEY (event_id, user_id)
  )
`).run();

const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});

client.once("ready", async () => {
	console.log(`Logged in as ${client.user.tag}`);

	const commands = [
		new SlashCommandBuilder()
			.setName("create-event")
			.setDescription("Create a new event."),
	].map((command) => command.toJSON());

	const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

	try {
		console.log("Registering slash commands...");
		await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
			body: commands,
		});
		console.log("Slash commands registered.");
	} catch (error) {
		console.error("Error registering slash commands:", error);
	}
});

client.on("interactionCreate", async (interaction) => {
	if (interaction.isCommand() && interaction.commandName === "create-event") {
		const modal = new ModalBuilder()
			.setCustomId("create_event_modal")
			.setTitle("Create an Event");

		const titleInput = new TextInputBuilder()
			.setCustomId("event_title")
			.setLabel("Event Name")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		const descriptionInput = new TextInputBuilder()
			.setCustomId("event_description")
			.setLabel("Description")
			.setStyle(TextInputStyle.Paragraph)
			.setRequired(false);

		const timeInput = new TextInputBuilder()
			.setCustomId("event_time")
			.setLabel("Time (UNIX TIMESTAMP ONLY)")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		const durationInput = new TextInputBuilder()
			.setCustomId("event_duration")
			.setLabel("Duration")
			.setStyle(TextInputStyle.Short)
			.setRequired(true);

		const imageInput = new TextInputBuilder()
			.setCustomId("event_image")
			.setLabel("Image URL (optional)")
			.setStyle(TextInputStyle.Short)
			.setRequired(false);

		modal.addComponents(
			new ActionRowBuilder().addComponents(titleInput),
			new ActionRowBuilder().addComponents(descriptionInput),
			new ActionRowBuilder().addComponents(timeInput),
			new ActionRowBuilder().addComponents(durationInput),
			new ActionRowBuilder().addComponents(imageInput),
		);

		await interaction.showModal(modal);
	}

	if (
		interaction.isModalSubmit() &&
		interaction.customId === "create_event_modal"
	) {
		const title = interaction.fields.getTextInputValue("event_title");
		const description =
			interaction.fields.getTextInputValue("event_description") ||
			"No description provided";
		const time = interaction.fields.getTextInputValue("event_time");
		const duration = interaction.fields.getTextInputValue("event_duration");
		const image = interaction.fields.getTextInputValue("event_image") || null;
		const eventId = uuidv4();

		const fullDescription = `${description}\n\n**Event Time**: <t:${time}:F> (<t:${time}:R>)\n\n**Duration**: ${duration}`;

		const embed = new EmbedBuilder()
			.setTitle(`${title}`)
			.setDescription(fullDescription)
			.addFields(
				{
					name: "<:checkmark:1365157872685547540> Attending (0)",
					value: "N/A",
					inline: true,
				},
				{
					name: "<:x_:1365157886908567592> Not Attending (0)",
					value: "N/A",
					inline: true,
				},
				{
					name: "<:question:1365157901450346536> Maybe (0)",
					value: "N/A",
					inline: true,
				},
			)
			.setColor(0x5865f2)
			.setTimestamp()
			.setFooter({ text: `Event ID: ${eventId}` });

		if (image) {
			embed.setThumbnail(image);
		} else {
			embed.setThumbnail("https://cdn.xanderxx.xyz/1a-logo.png");
		}

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`rsvp_${eventId}_yes`)
				.setEmoji("<:checkmark:1365157872685547540>")
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(`rsvp_${eventId}_no`)
				.setEmoji("<:x_:1365157886908567592>")
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(`rsvp_${eventId}_maybe`)
				.setEmoji("<:question:1365157901450346536>")
				.setStyle(ButtonStyle.Secondary),
		);

		const message = await interaction.reply({
			embeds: [embed],
			components: [row],
			fetchReply: true,
		});

		db.prepare(`
      INSERT INTO events (id, creator_id, title, description, time, duration, image, message_id, channel_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
			eventId,
			interaction.user.id,
			title,
			description,
			time,
			duration,
			image,
			message.id,
			message.channelId,
		);
	}

	if (interaction.isButton() && interaction.customId.startsWith("rsvp_")) {
		const [, eventId, status] = interaction.customId.split("_");
		const userId = interaction.user.id;

		try {
			db.prepare(`
        INSERT INTO rsvps (event_id, user_id, status)
        VALUES (?, ?, ?)
        ON CONFLICT(event_id, user_id) DO UPDATE SET status=excluded.status
      `).run(eventId, userId, status);

			const goingUsers = db
				.prepare("SELECT user_id FROM rsvps WHERE event_id = ? AND status = ?")
				.all(eventId, "yes");
			const notGoingUsers = db
				.prepare("SELECT user_id FROM rsvps WHERE event_id = ? AND status = ?")
				.all(eventId, "no");
			const maybeUsers = db
				.prepare("SELECT user_id FROM rsvps WHERE event_id = ? AND status = ?")
				.all(eventId, "maybe");

			const goingMentions = goingUsers
				.map((user) => `<@${user.user_id}>`)
				.join("\n");
			const notGoingMentions = notGoingUsers
				.map((user) => `<@${user.user_id}>`)
				.join("\n");
			const maybeMentions = maybeUsers
				.map((user) => `<@${user.user_id}>`)
				.join("\n");

			const event = db
				.prepare("SELECT * FROM events WHERE id = ?")
				.get(eventId);

			const updatedEmbed = new EmbedBuilder()
				.setTitle(`${event.title}`)
				.setDescription(
					`${event.description}\n\n**Event Time**: <t:${event.time}:F> (<t:${event.time}:R>)\n\n**Duration**: ${event.duration}`,
				)
				.addFields(
					{
						name: `<:checkmark:1365157872685547540> Attending (${goingUsers.length})`,
						value: goingMentions || "No one",
						inline: true,
					},
					{
						name: `<:x_:1365157886908567592> Not Attending (${notGoingUsers.length})`,
						value: notGoingMentions || "No one",
						inline: true,
					},
					{
						name: `<:question:1365157901450346536> Maybe (${maybeUsers.length})`,
						value: maybeMentions || "No one",
						inline: true,
					},
				)
				.setColor(0x5865f2)
				.setTimestamp()
				.setFooter({ text: `Event ID: ${eventId}` });

			if (event.image) {
				updatedEmbed.setThumbnail(event.image);
			} else {
				updatedEmbed.setThumbnail("https://cdn.xanderxx.xyz/1a-logo.png");
			}

			const message = await interaction.message.channel.messages.fetch(
				interaction.message.id,
			);
			await message.edit({ embeds: [updatedEmbed] });
			await interaction.deferUpdate();
		} catch (error) {
			console.error("Database error (RSVP):", error);
			await interaction.reply({
				content: "There was an error with your RSVP.",
				ephemeral: true,
			});
		}
	}
});

client.login(process.env.DISCORD_TOKEN);
