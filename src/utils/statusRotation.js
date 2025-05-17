import { ActivityType, PresenceUpdateStatus } from "discord.js";

const statusMessages = [
	{
		text: "Ramrod Sleep",
		type: ActivityType.Watching,
	},
	{
		text: "New Events",
		type: ActivityType.Watching,
	},
	{
		text: "Arma-3",
		type: ActivityType.Playing,
	},
];

let currentStatusIndex = -1;

// Function to update the bot's status
function updateStatus(client) {
	// Get a new random status that's different from the current one
	let newIndex;
	do {
		newIndex = Math.floor(Math.random() * statusMessages.length);
	} while (newIndex === currentStatusIndex && statusMessages.length > 1);

	currentStatusIndex = newIndex;
	const status = statusMessages[currentStatusIndex];

	client.user.setPresence({
		activities: [
			{
				name: status.text,
				type: status.type,
			},
		],
		status: PresenceUpdateStatus.DoNotDisturb, // Sets the bot to DND mode
	});

	console.log(`Status updated to: ${status.text} (${status.type})`);
}

export function setupStatusRotation(client) {
	// Set initial status
	updateStatus(client);

	// Set up status rotation every 30 seconds (30000 ms)
	setInterval(() => updateStatus(client), 30000);
}