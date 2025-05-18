import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getDatabase } from "../utils/database.js";

// Command definition
export const data = new SlashCommandBuilder()
	.setName("list-events")
	.setDescription("List all upcoming events.");

// Command execution
export async function execute(interaction) {
	try {
		// Query the database for upcoming events
		const db = getDatabase();
		const currentTime = Math.floor(Date.now() / 1000); // Current time in Unix timestamp

		const events = db
			.prepare(`
      SELECT id, title, description, time, duration
      FROM events
      WHERE time > ?
      ORDER BY time ASC
      LIMIT 10
    `)
			.all(currentTime);

		if (events.length === 0) {
			return await interaction.reply({
				content: "There are no upcoming events.",
				ephemeral: true,
			});
		}
		// Create an embed to display the events
		const embed = new EmbedBuilder()
			.setTitle("Upcoming Events")
			.setColor(0x5865f2)
			.setDescription("Here are the upcoming events:")
			.setTimestamp();

		// Add each event to the embed
		events.forEach((event, index) => {
			embed.addFields({
				name: `${index + 1}. ${event.title}`,
				value: `**When**: <t:${event.time}:F> (<t:${event.time}:R>)\n**Duration**: ${event.duration}\n**ID**: \`${event.id}\``,
			});
		});

		// Send the embed
		await interaction.reply({ embeds: [embed] });
	} catch (error) {
		console.error("Error executing list-events command:", error);
		await interaction.reply({
			content: "There was an error fetching the events.",
			ephemeral: true,
		});
	}
}
