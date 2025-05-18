import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getDatabase } from "../utils/database.js";

// Command definition
export const data = new SlashCommandBuilder()
	.setName("delete-event")
	.setDescription("Delete an event by its ID")
	.addStringOption((option) =>
		option
			.setName("id")
			.setDescription("The ID of the event to delete")
			.setRequired(true)
			.setAutocomplete(true),
	);

// Command execution
export async function execute(interaction) {
	try {
		const eventId = interaction.options.getString("id");
		const db = getDatabase();

		// First check if the event exists and get all necessary information
		const event = db
			.prepare(
				"SELECT title, message_id, channel_id, creator_id FROM events WHERE id = ?",
			)
			.get(eventId);

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
					"You can only delete events that you created or if you're an administrator.",
				ephemeral: true,
			});
		}

		// Try to delete the Discord message first
		let messageDeleted = false;
		try {
			// Defer the reply to give us time to delete the message
			await interaction.deferReply();

			// Log debug info
			console.log("Attempting to delete message...");
			console.log("Channel ID:", event.channel_id);
			console.log("Message ID:", event.message_id);

			// Get the channel
			const channel = await interaction.client.channels.fetch(event.channel_id);

			if (channel) {
				// Try to get and delete the message
				const message = await channel.messages.fetch(event.message_id);
				if (message) {
					await message.delete();
					messageDeleted = true;
					console.log("Message deleted successfully");
				}
			}
		} catch (messageError) {
			console.error("Error deleting message:", messageError);
			// We'll continue even if message deletion fails
		}

		// Delete the event and associated RSVPs from the database
		db.transaction(() => {
			db.prepare("DELETE FROM events WHERE id = ?").run(eventId);
			db.prepare("DELETE FROM rsvps WHERE event_id = ?").run(eventId);
		})();

		// Create response embed
		const embed = new EmbedBuilder()
			.setTitle("Event Deleted")
			.setColor(0x00ff00)
			.setDescription(`Successfully deleted event: **${event.title}**`)
			.addFields({
				name: "Event ID",
				value: `\`${eventId}\``,
			});

		if (messageDeleted) {
			embed.addFields({
				name: "Discord Message",
				value: "The event message was also deleted from the channel.",
			});
		} else {
			embed.addFields({
				name: "Discord Message",
				value:
					"The event message could not be deleted. It may have been deleted already or the bot lacks permissions.",
			});
		}

		embed.setTimestamp();

		// Send the response
		await interaction.editReply({ embeds: [embed] });
	} catch (error) {
		console.error("Error executing delete-event command:", error);
		if (!interaction.replied && !interaction.deferred) {
			await interaction.reply({
				content: "There was an error deleting the event.",
				ephemeral: true,
			});
		} else {
			await interaction.editReply({
				content: "There was an error deleting the event.",
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
			const eventTime = new Date(event.time * 1000);
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
