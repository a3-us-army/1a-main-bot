import { ActivityType, PresenceUpdateStatus } from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to load statuses from JSON file
function loadStatusMessages() {
	try {
		// Read the JSON file
		const filePath = path.join(__dirname, "../config/statuses.json");
		const data = fs.readFileSync(filePath, "utf8");
		const statuses = JSON.parse(data);

		// Validate and convert the numeric types to ActivityType
		return statuses.map((status) => ({
			text: status.text,
			type: status.type, // ActivityType is already a number in Discord.js
		}));
	} catch (error) {
		console.error("Error loading status messages:", error);
		// Return default statuses if there's an error
		return [
			{
				text: "Error Loading Statuses lol",
				type: ActivityType.Playing,
			},
		];
	}
}

let statusMessages = [];
let currentStatusIndex = -1;

// Function to update the bot's status
function updateStatus(client) {
	// Reload statuses from file each time to pick up changes
	statusMessages = loadStatusMessages();

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

	console.log(`Status updated to: ${ActivityType[status.type]} ${status.text}`);
}

export function setupStatusRotation(client) {
	// Load statuses initially
	statusMessages = loadStatusMessages();

	// Set initial status
	updateStatus(client);

	// Set up status rotation every 30 seconds (30000 ms)
	setInterval(() => updateStatus(client), 30000);
}
