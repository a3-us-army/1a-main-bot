// fullLogger.js
import { EmbedBuilder, ChannelType } from "discord.js";
import chalk from "chalk";

// Helper: format attachments as links
function formatAttachments(attachments) {
	if (!attachments || attachments.size === 0) return null;
	return Array.from(attachments.values())
		.map((att) => `[${att.name}](${att.url})`)
		.join("\n");
}

// Helper: jump to message link
function jumpLink(guildId, channelId, messageId) {
	return `[${messageId}](https://discord.com/channels/${guildId}/${channelId}/${messageId})`;
}

export function setupFullLogger(client, LOG_CHANNEL_ID) {
	console.log(
		chalk.bgBlue.whiteBright("Logger enabled for the following events:"),
	);
	console.log(
		`${chalk.greenBright("• Member Join/Leave/Kick/Ban/Unban")}\n${chalk.blueBright("• Message Create/Edit/Delete/Bulk Delete")}\n${chalk.magentaBright("• Channel Create/Delete/Update")}\n${chalk.yellowBright("• Voice Join/Leave/Move")}\n${chalk.cyanBright("• Server Updates")}\n${chalk.yellow("• Role Create/Delete/Update")}\n${chalk.whiteBright("• Emoji Create/Delete/Update")}\n${chalk.gray("• Invite Create/Delete")}\n${chalk.redBright("• Error Logging")}`,
	);
	// --- Member Join ---
	client.on("guildMemberAdd", async (member) => {
		console.log(
			chalk.greenBright(
				`[Logger] Member Joined: ${member.user.tag} (${member.id})`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0x2ecc71)
			.setTitle("Member Joined")
			.addFields(
				{
					name: "User",
					value: `${member.user} (<@${member.id}>)`,
					inline: true,
				},
				{ name: "User ID", value: member.id, inline: true },
				{
					name: "Account Created",
					value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
					inline: true,
				},
			)
			.setFooter({ text: `User ID: ${member.id}` })
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Member Leave / Kick ---
	client.on("guildMemberRemove", async (member) => {
		// Check audit log for a kick
		let mod = "Unknown";
		let reason = "No reason provided";
		let kicked = false;
		try {
			const fetchedLogs = await member.guild.fetchAuditLogs({
				type: 20,
				limit: 5,
			}); // 20 = MEMBER_KICK
			const kickLog = fetchedLogs.entries.find(
				(entry) =>
					entry.target.id === member.id &&
					Date.now() - entry.createdTimestamp < 10000, // within 10 seconds
			);
			if (kickLog) {
				kicked = true;
				mod = `${kickLog.executor} (<@${kickLog.executor.id}>)`;
				reason = kickLog.reason || "No reason provided";
			}
		} catch (e) {}

		console.log(
			kicked
				? chalk.yellowBright(
						`[Logger] Member Kicked: ${member.user.tag} (${member.id}) by ${mod}`,
					)
				: chalk.gray(`[Logger] Member Left: ${member.user.tag} (${member.id})`),
		);

		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(kicked ? 0xe67e22 : 0x95a5a6)
			.setTitle(kicked ? "User Kicked" : "Member Left")
			.addFields(
				{
					name: "User",
					value: `${member.user} (<@${member.id}>)`,
					inline: true,
				},
				{ name: "User ID", value: member.id, inline: true },
				{
					name: "Account Created",
					value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
					inline: true,
				},
			)
			.setFooter({ text: `User ID: ${member.id}` })
			.setTimestamp();

		if (kicked) {
			embed.addFields(
				{ name: "Moderator", value: mod, inline: true },
				{ name: "Reason", value: reason, inline: false },
			);
		}

		await logChannel.send({ embeds: [embed] });
	});

	// --- Ban ---
	client.on("guildBanAdd", async (ban) => {
		console.log(
			chalk.redBright(`[Logger] User Banned: ${ban.user.tag} (${ban.user.id})`),
		);
		const { guild, user } = ban;
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		let mod = "Unknown";
		let reason = "No reason provided";
		try {
			const fetchedLogs = await guild.fetchAuditLogs({ type: 22, limit: 5 }); // 22 = MEMBER_BAN_ADD
			const banLog = fetchedLogs.entries.find(
				(entry) =>
					entry.target.id === user.id &&
					Date.now() - entry.createdTimestamp < 10000, // within 10 seconds
			);
			if (banLog) {
				mod = `${banLog.executor} (<@${banLog.executor.id}>)`;
				reason = banLog.reason || "No reason provided";
			}
		} catch (e) {}

		const embed = new EmbedBuilder()
			.setColor(0xe74c3c)
			.setTitle("User Banned")
			.addFields(
				{ name: "User", value: `${user} (<@${user.id}>)`, inline: true },
				{ name: "User ID", value: user.id, inline: true },
				{ name: "Moderator", value: mod, inline: true },
				{ name: "Reason", value: reason, inline: false },
			)
			.setFooter({ text: `User ID: ${user.id}` })
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Unban ---
	client.on("guildBanRemove", async (ban) => {
		console.log(
			chalk.greenBright(
				`[Logger] User Unbanned: ${ban.user.tag} (${ban.user.id})`,
			),
		);
		const { guild, user } = ban;
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0x2ecc71)
			.setTitle("User Unbanned")
			.addFields(
				{ name: "User", value: `${user} (<@${user.id}>)`, inline: true },
				{ name: "User ID", value: user.id, inline: true },
			)
			.setFooter({ text: `User ID: ${user.id}` })
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Message Edit ---
	client.on("messageUpdate", async (oldMsg, newMsg) => {
		if (
			oldMsg.partial ||
			newMsg.partial ||
			oldMsg.author?.bot ||
			!oldMsg.guild ||
			(oldMsg.content === newMsg.content &&
				!oldMsg.attachments?.size &&
				!newMsg.attachments?.size)
		)
			return;
		console.log(
			chalk.yellowBright(
				`[Logger] Message Edited: ${oldMsg.author.tag} (${oldMsg.author.id}) in #${oldMsg.channel.name}`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const beforeAttachments = formatAttachments(oldMsg.attachments);
		const afterAttachments = formatAttachments(newMsg.attachments);

		const embed = new EmbedBuilder()
			.setColor(0xf1c40f)
			.setTitle("Message edited")
			.addFields(
				{
					name: "Channel",
					value: `${oldMsg.channel} (\`#${oldMsg.channel.name}\`)`,
					inline: true,
				},
				{
					name: "Message ID",
					value: jumpLink(oldMsg.guild.id, oldMsg.channel.id, oldMsg.id),
					inline: true,
				},
				{
					name: "Created",
					value: `<t:${Math.floor(oldMsg.createdTimestamp / 1000)}:R>`,
					inline: true,
				},
				{
					name: "Author",
					value: `${oldMsg.author} (<@${oldMsg.author.id}>)`,
					inline: true,
				},
				{
					name: "Before",
					value: oldMsg.content || "*No content*",
					inline: false,
				},
				{
					name: "After",
					value: newMsg.content || "*No content*",
					inline: false,
				},
			)
			.setFooter({ text: `User ID: ${oldMsg.author.id}` })
			.setTimestamp();

		if (beforeAttachments) {
			embed.addFields({
				name: "Before Attachments",
				value: beforeAttachments,
				inline: false,
			});
		}
		if (afterAttachments) {
			embed.addFields({
				name: "After Attachments",
				value: afterAttachments,
				inline: false,
			});
		}

		await logChannel.send({ embeds: [embed] });
	});

	// --- Message Delete ---
	client.on("messageDelete", async (message) => {
		if (message.partial || message.author?.bot || !message.guild) return;
		console.log(
			chalk.redBright(
				`[Logger] Message Deleted: ${message.author.tag} (${message.author.id}) in #${message.channel.name}`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const attachments = formatAttachments(message.attachments);

		const embed = new EmbedBuilder()
			.setColor(0xe74c3c)
			.setTitle("Message deleted")
			.addFields(
				{
					name: "Channel",
					value: `${message.channel} (\`#${message.channel.name}\`)`,
					inline: true,
				},
				{
					name: "Message ID",
					value: jumpLink(message.guild.id, message.channel.id, message.id),
					inline: true,
				},
				{
					name: "Created",
					value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
					inline: true,
				},
				{
					name: "Author",
					value: `${message.author} (<@${message.author.id}>)`,
					inline: true,
				},
				{
					name: "Message",
					value: message.content || "*No content*",
					inline: false,
				},
			)
			.setFooter({ text: `User ID: ${message.author.id}` })
			.setTimestamp();

		if (attachments) {
			embed.addFields({
				name: "Attachments",
				value: attachments,
				inline: false,
			});
		}

		await logChannel.send({ embeds: [embed] });
	});

	// --- Bulk Message Delete ---
	client.on("messageDeleteBulk", async (messages) => {
		const channel = messages.first()?.channel;
		console.log(
			chalk.redBright(
				`[Logger] Bulk Message Delete: ${messages.size} messages in #${channel?.name}`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0xe74c3c)
			.setTitle("Bulk Message Delete")
			.addFields(
				{
					name: "Channel",
					value: `${channel} (\`#${channel.name}\`)`,
					inline: true,
				},
				{ name: "Messages Deleted", value: `${messages.size}`, inline: true },
			)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Channel Created ---
	client.on("channelCreate", async (channel) => {
		console.log(
			chalk.greenBright(
				`[Logger] Channel Created: #${channel.name} (${channel.id})`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0x2ecc71)
			.setTitle("Channel Created")
			.addFields(
				{
					name: "Channel",
					value: `${channel} (\`#${channel.name}\`)`,
					inline: true,
				},
				{ name: "Type", value: `\`${channel.type}\``, inline: true },
			)
			.setFooter({ text: `Channel ID: ${channel.id}` })
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Channel Deleted ---
	client.on("channelDelete", async (channel) => {
		console.log(
			chalk.redBright(
				`[Logger] Channel Deleted: #${channel.name} (${channel.id})`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0xe74c3c)
			.setTitle("Channel Deleted")
			.addFields(
				{ name: "Channel", value: `${channel.name}`, inline: true },
				{ name: "Type", value: `\`${channel.type}\``, inline: true },
			)
			.setFooter({ text: `Channel ID: ${channel.id}` })
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Channel Updated ---
	client.on("channelUpdate", async (oldChannel, newChannel) => {
		console.log(
			chalk.yellowBright(
				`[Logger] Channel Updated: #${oldChannel.name} (${oldChannel.id})`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const changes = [];
		if (oldChannel.name !== newChannel.name) {
			changes.push({
				name: "Name",
				value: `\`${oldChannel.name}\` → \`${newChannel.name}\``,
				inline: false,
			});
		}
		if (oldChannel.type !== newChannel.type) {
			changes.push({
				name: "Type",
				value: `\`${oldChannel.type}\` → \`${newChannel.type}\``,
				inline: false,
			});
		}
		if ("topic" in oldChannel && oldChannel.topic !== newChannel.topic) {
			changes.push({
				name: "Topic",
				value: `\`${oldChannel.topic || "None"}\` → \`${newChannel.topic || "None"}\``,
				inline: false,
			});
		}
		if ("nsfw" in oldChannel && oldChannel.nsfw !== newChannel.nsfw) {
			changes.push({
				name: "NSFW",
				value: `\`${oldChannel.nsfw}\` → \`${newChannel.nsfw}\``,
				inline: false,
			});
		}
		if ("bitrate" in oldChannel && oldChannel.bitrate !== newChannel.bitrate) {
			changes.push({
				name: "Bitrate",
				value: `\`${oldChannel.bitrate}\` → \`${newChannel.bitrate}\``,
				inline: false,
			});
		}
		if (
			"userLimit" in oldChannel &&
			oldChannel.userLimit !== newChannel.userLimit
		) {
			changes.push({
				name: "User Limit",
				value: `\`${oldChannel.userLimit}\` → \`${newChannel.userLimit}\``,
				inline: false,
			});
		}
		if (changes.length === 0) return;

		const embed = new EmbedBuilder()
			.setColor(0x7289da)
			.setTitle("Channel Updated")
			.addFields(
				{
					name: "Channel",
					value: `${newChannel} (\`#${newChannel.name}\`)`,
					inline: true,
				},
				...changes,
			)
			.setFooter({ text: `Channel ID: ${newChannel.id}` })
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Voice State Update (Join/Leave/Move) ---
	client.on("voiceStateUpdate", async (oldState, newState) => {
		const user = newState.member?.user || oldState.member?.user;
		if (!user) return;
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		// Join
		if (!oldState.channel && newState.channel) {
			console.log(
				chalk.greenBright(
					`[Logger] Voice Join: ${user.tag} (${user.id}) joined #${newState.channel.name}`,
				),
			);
			const embed = new EmbedBuilder()
				.setColor(0x2ecc71)
				.setTitle("Voice Channel Joined")
				.addFields(
					{ name: "User", value: `${user} (<@${user.id}>)`, inline: true },
					{
						name: "Channel",
						value: `${newState.channel} (\`#${newState.channel.name}\`)`,
						inline: true,
					},
				)
				.setFooter({ text: `User ID: ${user.id}` })
				.setTimestamp();
			await logChannel.send({ embeds: [embed] });
		}
		// Leave
		else if (oldState.channel && !newState.channel) {
			console.log(
				chalk.redBright(
					`[Logger] Voice Leave: ${user.tag} (${user.id}) left #${oldState.channel.name}`,
				),
			);
			const embed = new EmbedBuilder()
				.setColor(0xe74c3c)
				.setTitle("Voice Channel Left")
				.addFields(
					{ name: "User", value: `${user} (<@${user.id}>)`, inline: true },
					{
						name: "Channel",
						value: `${oldState.channel} (\`#${oldState.channel.name}\`)`,
						inline: true,
					},
				)
				.setFooter({ text: `User ID: ${user.id}` })
				.setTimestamp();
			await logChannel.send({ embeds: [embed] });
		}
		// Move
		else if (
			oldState.channel &&
			newState.channel &&
			oldState.channel.id !== newState.channel.id
		) {
			console.log(
				chalk.yellowBright(
					`[Logger] Voice Move: ${user.tag} (${user.id}) from #${oldState.channel.name} to #${newState.channel.name}`,
				),
			);
			const embed = new EmbedBuilder()
				.setColor(0xf1c40f)
				.setTitle("Voice Channel Moved")
				.addFields(
					{ name: "User", value: `${user} (<@${user.id}>)`, inline: true },
					{
						name: "From",
						value: `${oldState.channel} (\`#${oldState.channel.name}\`)`,
						inline: true,
					},
					{
						name: "To",
						value: `${newState.channel} (\`#${newState.channel.name}\`)`,
						inline: true,
					},
				)
				.setFooter({ text: `User ID: ${user.id}` })
				.setTimestamp();
			await logChannel.send({ embeds: [embed] });
		}
	});

	// --- Server Updates ---
	client.on("guildUpdate", async (oldGuild, newGuild) => {
		console.log(
			chalk.cyanBright(
				`[Logger] Server Updated: ${oldGuild.name} (${oldGuild.id})`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const changes = [];
		if (oldGuild.name !== newGuild.name) {
			changes.push({
				name: "Server Name",
				value: `\`${oldGuild.name}\` → \`${newGuild.name}\``,
				inline: false,
			});
		}
		if (oldGuild.icon !== newGuild.icon) {
			changes.push({
				name: "Server Icon Changed",
				value: `[Old Icon](${oldGuild.iconURL() || "N/A"}) → [New Icon](${newGuild.iconURL() || "N/A"})`,
				inline: false,
			});
		}
		if (oldGuild.ownerId !== newGuild.ownerId) {
			changes.push({
				name: "Owner Changed",
				value: `<@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`,
				inline: false,
			});
		}
		if (changes.length === 0) return;

		const embed = new EmbedBuilder()
			.setColor(0x7289da)
			.setTitle("Server Updated")
			.addFields(...changes)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Role Create/Delete/Update ---
	client.on("roleCreate", async (role) => {
		console.log(
			chalk.greenBright(`[Logger] Role Created: ${role.name} (${role.id})`),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0x2ecc71)
			.setTitle("Role Created")
			.addFields(
				{ name: "Role", value: `${role} (\`${role.name}\`)`, inline: true },
				{ name: "Role ID", value: role.id, inline: true },
			)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	client.on("roleDelete", async (role) => {
		console.log(
			chalk.redBright(`[Logger] Role Deleted: ${role.name} (${role.id})`),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0xe74c3c)
			.setTitle("Role Deleted")
			.addFields(
				{ name: "Role", value: `${role.name}`, inline: true },
				{ name: "Role ID", value: role.id, inline: true },
			)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	client.on("roleUpdate", async (oldRole, newRole) => {
		console.log(
			chalk.yellowBright(
				`[Logger] Role Updated: ${oldRole.name} (${oldRole.id})`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const changes = [];
		if (oldRole.name !== newRole.name) {
			changes.push({
				name: "Name",
				value: `\`${oldRole.name}\` → \`${newRole.name}\``,
				inline: false,
			});
		}
		if (oldRole.color !== newRole.color) {
			changes.push({
				name: "Color",
				value: `\`${oldRole.hexColor}\` → \`${newRole.hexColor}\``,
				inline: false,
			});
		}
		if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
			changes.push({
				name: "Permissions",
				value: `\`${oldRole.permissions.bitfield}\` → \`${newRole.permissions.bitfield}\``,
				inline: false,
			});
		}
		if (changes.length === 0) return;

		const embed = new EmbedBuilder()
			.setColor(0x7289da)
			.setTitle("Role Updated")
			.addFields(
				{
					name: "Role",
					value: `${newRole} (\`${newRole.name}\`)`,
					inline: true,
				},
				...changes,
			)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Emoji Create/Delete/Update ---
	client.on("emojiCreate", async (emoji) => {
		console.log(
			chalk.greenBright(`[Logger] Emoji Created: ${emoji.name} (${emoji.id})`),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0x2ecc71)
			.setTitle("Emoji Created")
			.addFields(
				{ name: "Emoji", value: `${emoji} (\`${emoji.name}\`)`, inline: true },
				{ name: "Emoji ID", value: emoji.id, inline: true },
			)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	client.on("emojiDelete", async (emoji) => {
		console.log(
			chalk.redBright(`[Logger] Emoji Deleted: ${emoji.name} (${emoji.id})`),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0xe74c3c)
			.setTitle("Emoji Deleted")
			.addFields(
				{ name: "Emoji", value: `${emoji.name}`, inline: true },
				{ name: "Emoji ID", value: emoji.id, inline: true },
			)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	client.on("emojiUpdate", async (oldEmoji, newEmoji) => {
		console.log(
			chalk.yellowBright(
				`[Logger] Emoji Updated: ${oldEmoji.name} (${oldEmoji.id})`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const changes = [];
		if (oldEmoji.name !== newEmoji.name) {
			changes.push({
				name: "Name",
				value: `\`${oldEmoji.name}\` → \`${newEmoji.name}\``,
				inline: false,
			});
		}
		if (changes.length === 0) return;

		const embed = new EmbedBuilder()
			.setColor(0x7289da)
			.setTitle("Emoji Updated")
			.addFields(
				{
					name: "Emoji",
					value: `${newEmoji} (\`${newEmoji.name}\`)`,
					inline: true,
				},
				...changes,
			)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Invite Create/Delete ---
	client.on("inviteCreate", async (invite) => {
		console.log(
			chalk.greenBright(
				`[Logger] Invite Created: ${invite.code} in #${invite.channel?.name}`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0x2ecc71)
			.setTitle("Invite Created")
			.addFields(
				{
					name: "Invite",
					value: `[${invite.code}](${invite.url})`,
					inline: true,
				},
				{
					name: "Channel",
					value: `${invite.channel} (\`#${invite.channel.name}\`)`,
					inline: true,
				},
				{
					name: "Inviter",
					value: invite.inviter
						? `${invite.inviter} (<@${invite.inviter.id}>)`
						: "Unknown",
					inline: true,
				},
			)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	client.on("inviteDelete", async (invite) => {
		console.log(
			chalk.redBright(
				`[Logger] Invite Deleted: ${invite.code} in #${invite.channel?.name}`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0xe74c3c)
			.setTitle("Invite Deleted")
			.addFields(
				{
					name: "Invite",
					value: `[${invite.code}](https://discord.gg/${invite.code})`,
					inline: true,
				},
				{
					name: "Channel",
					value: `${invite.channel ? invite.channel : "Unknown"}`,
					inline: true,
				},
			)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	// --- Error Logging ---
	client.on("error", async (error) => {
		console.log(
			chalk.bgRed.whiteBright(`[Logger] Bot Error: ${error.stack || error}`),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0xe74c3c)
			.setTitle("Bot Error")
			.setDescription(`\`\`\`${error.stack || error}\`\`\``)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});

	process.on("unhandledRejection", async (error) => {
		console.log(
			chalk.bgRed.whiteBright(
				`[Logger] Unhandled Promise Rejection: ${error.stack || error}`,
			),
		);
		const logChannel = await client.channels
			.fetch(LOG_CHANNEL_ID)
			.catch(() => null);
		if (!logChannel || !logChannel.isTextBased()) return;

		const embed = new EmbedBuilder()
			.setColor(0xe74c3c)
			.setTitle("Unhandled Promise Rejection")
			.setDescription(`\`\`\`${error.stack || error}\`\`\``)
			.setTimestamp();

		await logChannel.send({ embeds: [embed] });
	});
}
