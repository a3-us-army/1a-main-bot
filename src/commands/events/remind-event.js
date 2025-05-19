import {
	SlashCommandBuilder,
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} from "discord.js";
import { getDatabase } from "../../utils/database.js";

// Command definition
export const data = new SlashCommandBuilder()
	.setName("remind-event")
	.setDescription("Send a reminder to all attendees about an upcoming event")
	.addStringOption((option) =>
		option
			.setName("id")
			.setDescription("The ID of the event to send reminders for")
			.setRequired(true)
			.setAutocomplete(true),
	)
	.addStringOption((option) =>
		option
			.setName("message")
			.setDescription("Optional custom message to include with the reminder")
			.setRequired(false),
	);

// Command execution
export async function execute(interaction) {
	try {
		const eventId = interaction.options.getString("id");
		const customMessage = interaction.options.getString("message");
		const db = getDatabase();

		// Get event information
		const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId);

		if (!event) {
			return await interaction.reply({
				content: `No event found with ID: \`${eventId}\``,
				ephemeral: true,
			});
		}

		// Check if the user is the creator of the event or has admin permissions
		if (
			event.creator_id !== interaction.user.id &&
			!interaction.member.permissions.has("ADMINISTRATOR")
		) {
			return await interaction.reply({
				content:
					"You can only send reminders for events that you created or if you're an administrator.",
				ephemeral: true,
			});
		}

		// Get the list of attendees who RSVP'd "yes"
		const attendees = db
			.prepare(
				"SELECT user_id FROM rsvps WHERE event_id = ? AND status = 'yes'",
			)
			.all(eventId);

		if (attendees.length === 0) {
			return await interaction.reply({
				content: "There are no attendees who have RSVP'd 'yes' to this event.",
				ephemeral: true,
			});
		}

		// Defer the reply as this might take some time
		await interaction.deferReply();

		// Create the reminder embed
		const reminderEmbed = new EmbedBuilder()
			.setTitle(`Reminder: ${event.title}`)
			.setColor(0xf1c40f) // Yellow color for reminders
			.setDescription(
				`This is a reminder that you're attending an event ${customMessage ? `\n\n**Message from organizer**: ${customMessage}` : ""}`,
			)
			.addFields(
				{
					name: "📅 When",
					value: `<t:${event.time}:F> (<t:${event.time}:R>)`,
					inline: true,
				},
				{
					name: "⏱️ Duration",
					value: event.duration || "Not specified",
					inline: true,
				},
			)
			.setFooter({ text: `Event ID: ${event.id}` })
			.setTimestamp();

		// Add image if it exists
		if (event.image) {
			reminderEmbed.setImage(event.image);
		}

		// Add link to original message if available
		if (event.channel_id && event.message_id) {
			reminderEmbed.addFields({
				name: "🔗 Event Link",
				value: `[Jump to Event](https://discord.com/channels/${interaction.guildId}/${event.channel_id}/${event.message_id})`,
				inline: false,
			});
		}

		// Create a button to check equipment list
		const equipmentButton = new ButtonBuilder()
			.setCustomId(`check_equipment_${event.id}`)
			.setLabel("Check Equipment List")
			.setStyle(ButtonStyle.Primary)
			.setEmoji("🧰");

		const row = new ActionRowBuilder().addComponents(equipmentButton);

		// Create a list of user mentions
		const mentions = attendees.map((a) => `<@${a.user_id}>`).join(" ");

		// Send the reminder to the channel where the command was used
		await interaction.channel.send({
			content: `**Event Reminder!** ${mentions}`,
			embeds: [reminderEmbed],
			components: [row],
		});

		// Respond to the interaction
		await interaction.editReply({
			content: `Successfully sent reminders to ${attendees.length} attendees for the event "${event.title}".`,
		});
	} catch (error) {
		console.error("Error executing remind-event command:", error);
		if (!interaction.replied && !interaction.deferred) {
			await interaction.reply({
				content: "There was an error sending the event reminders.",
				ephemeral: true,
			});
		} else {
			await interaction.editReply({
				content: "There was an error sending the event reminders.",
			});
		}
	}
}

// Autocomplete handler
export async function autocomplete(interaction) {
	try {
		const focusedValue = interaction.options.getFocused().toLowerCase();
		const db = getDatabase();
		const currentTime = Math.floor(Date.now() / 1000);

		// Get upcoming events
		const events = db
			.prepare(`
        SELECT id, title, time 
        FROM events 
        WHERE time > ?
        ORDER BY time ASC 
        LIMIT 25
      `)
			.all(currentTime);

		// Filter events based on user input (matching either ID or title)
		const filtered = events.filter(
			(event) =>
				event.id.toLowerCase().includes(focusedValue) ||
				event.title.toLowerCase().includes(focusedValue),
		);

		// Format the choices for autocomplete
		const choices = filtered.map((event) => {
			// Format time as relative time (e.g., "in 2 days")
			const timeString = `<t:${event.time}:R>`;

			return {
				name: `${event.title} (${timeString}) - ID: ${event.id}`,
				value: event.id,
			};
		});

		// Respond with the choices (max 25)
		await interaction.respond(choices.slice(0, 25));
	} catch (error) {
		console.error("Error handling autocomplete:", error);
		// Provide empty results in case of error
		await interaction.respond([]);
	}
}

// Function to send automatic reminders
export async function sendAutomaticReminder(client, event) {
	try {
		const db = getDatabase();

		// Get the list of attendees who RSVP'd "yes"
		const attendees = db
			.prepare(
				"SELECT user_id FROM rsvps WHERE event_id = ? AND status = 'yes'",
			)
			.all(event.id);

		if (attendees.length === 0) {
			return; // No attendees to remind
		}

		// Create the reminder embed
		const reminderEmbed = new EmbedBuilder()
			.setTitle(`Reminder: ${event.title}`)
			.setColor(0xf1c40f) // Yellow color for reminders
			.setDescription(
				`This is an automatic reminder that you're attending an event starting in about an hour!`,
			)
			.addFields(
				{
					name: "📅 When",
					value: `<t:${event.time}:F> (<t:${event.time}:R>)`,
					inline: true,
				},
				{
					name: "⏱️ Duration",
					value: event.duration || "Not specified",
					inline: true,
				},
			)
			.setFooter({ text: `Event ID: ${event.id}` })
			.setTimestamp();

		// Add image if it exists
		if (event.image) {
			reminderEmbed.setImage(event.image);
		}

		// Add link to original message if available
		if (event.channel_id && event.message_id) {
			reminderEmbed.addFields({
				name: "🔗 Event Link",
				value: `[Jump to Event](https://discord.com/channels/${event.guild_id || client.guilds.cache.first().id}/${event.channel_id}/${event.message_id})`,
				inline: false,
			});
		}

		// Create a button to check equipment list
		const equipmentButton = new ButtonBuilder()
			.setCustomId(`check_equipment_${event.id}`)
			.setLabel("Check Equipment List")
			.setStyle(ButtonStyle.Secondary);

		const row = new ActionRowBuilder().addComponents(equipmentButton);

		// Create a list of user mentions
		const mentions = attendees.map((a) => `<@${a.user_id}>`).join(" ");

		// Get the channel to send the reminder to
		const channel = await client.channels.fetch(event.channel_id);
		if (!channel) return;

		// Send the reminder
		await channel.send({
			content: `**Automatic Event Reminder!** ${mentions}`,
			embeds: [reminderEmbed],
			components: [row],
		});

		console.log(
			`Sent automatic reminder for event: ${event.title} (${event.id})`,
		);
	} catch (error) {
		console.error(
			`Error sending automatic reminder for event ${event.id}:`,
			error,
		);
	}
}

// Handler for the equipment button click
export async function handleEquipmentButtonClick(interaction) {
	try {
		// Defer reply immediately to avoid timeout
		await interaction.deferReply({ ephemeral: true });

		// Extract the event ID from the custom ID
		const eventId = interaction.customId.replace("check_equipment_", "");
		const db = getDatabase();

		// Get event information
		const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId);

		if (!event) {
			return await interaction.editReply({
				content: "This event no longer exists.",
			});
		}

		// Get equipment for this event
		const equipment = db
			.prepare(`
				SELECT er.*, e.name, e.category, e.description 
				FROM equipment_requests er
				JOIN equipment e ON er.equipment_id = e.id
				WHERE er.event_id = ?
			`)
			.all(eventId);

		if (equipment.length === 0) {
			return await interaction.editReply({
				content: "No equipment has been requested for this event.",
			});
		}

		// Group equipment by category and status
		const groupedEquipment = {};
		for (const item of equipment) {
			if (!groupedEquipment[item.category]) {
				groupedEquipment[item.category] = [];
			}
			groupedEquipment[item.category].push(item);
		}

		// Create an embed to display the equipment
		const equipmentEmbed = new EmbedBuilder()
			.setTitle(`Equipment for: ${event.title}`)
			.setColor(0x3498db)
			.setDescription(
				"The following equipment has been requested for this event:",
			)
			.setFooter({ text: `Event ID: ${event.id}` });

		// Add fields for each category
		for (const [category, items] of Object.entries(groupedEquipment)) {
			equipmentEmbed.addFields({
				name: `📋 ${category}`,
				value: items
					.map(
						(item) => `• **${item.name}** (${item.quantity}x) - ${item.status}`,
					)
					.join("\n"),
				inline: false,
			});
		}

		// Edit the deferred reply with the equipment list
		await interaction.editReply({
			embeds: [equipmentEmbed],
		});
	} catch (error) {
		console.error("Error handling equipment button click:", error);
		try {
			if (!interaction.deferred && !interaction.replied) {
				await interaction.reply({
					content: "There was an error retrieving the equipment list.",
					ephemeral: true,
				});
			} else {
				await interaction.editReply({
					content: "There was an error retrieving the equipment list.",
				});
			}
		} catch (err) {
			console.error("Failed to send error message to user:", err);
		}
	}
}
