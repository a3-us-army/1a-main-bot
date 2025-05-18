import { EmbedBuilder } from "discord.js";
import { updateRSVP, getEvent, getRSVPs } from "../utils/database.js";

export async function handleButtonInteraction(interaction) {
	const [, eventId, status] = interaction.customId.split("_");
	const userId = interaction.user.id;

	try {
		// Update RSVP in database
		updateRSVP(eventId, userId, status);

		// Get RSVPs for this event
		const goingUsers = getRSVPs(eventId, "yes");
		const notGoingUsers = getRSVPs(eventId, "no");
		const maybeUsers = getRSVPs(eventId, "maybe");

		// Format mentions
		const goingMentions = goingUsers
			.map((user) => `<@${user.user_id}>`)
			.join("\n");
		const notGoingMentions = notGoingUsers
			.map((user) => `<@${user.user_id}>`)
			.join("\n");
		const maybeMentions = maybeUsers
			.map((user) => `<@${user.user_id}>`)
			.join("\n");

		// Get event details
		const event = getEvent(eventId);

		// Create updated embed
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

		// Update the message
		const message = await interaction.message.channel.messages.fetch(
			interaction.message.id,
		);
		await message.edit({ embeds: [updatedEmbed] });
		await interaction.deferUpdate();
	} catch (error) {
		console.error("Error handling button interaction:", error);
		if (!interaction.replied && !interaction.deferred) {
			await interaction.reply({
				content: "There was an error with your RSVP.",
				ephemeral: true,
			});
		}
	}
}
