import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fs from "fs";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CALLBACK_URL = process.env.DASHBOARD_CALLBACK_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;
const PORT = process.env.PORT;
const BOT_API_SECRET = process.env.BOT_API_SECRET;
const BOT_API_URL =
	process.env.BOT_API_URL || "http://localhost:3001/api/post-event";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "../../events.db");
let db;

const ADMIN_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const adminCache = new Map(); // userId -> { isAdmin, expires }

async function isUserAdmin(userId) {
	console.log(`[ADMIN CHECK] isUserAdmin called for user: ${userId}`);
	const guildId = process.env.GUILD_ID;
	const botToken = process.env.DISCORD_TOKEN;
	if (!guildId || !botToken) {
		console.error(
			"[ADMIN CHECK] Missing GUILD_ID or BOT_TOKEN in environment.",
		);
		return false;
	}

	// Check cache first
	const cached = adminCache.get(userId);
	const now = Date.now();
	if (cached && cached.expires > now) {
		console.log(`[ADMIN CACHE] User ${userId} isAdmin: ${cached.isAdmin}`);
		return cached.isAdmin;
	}

	try {
		const res = await fetch(
			`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
			{
				headers: { Authorization: `Bot ${botToken}` },
			},
		);
		console.log(`[ADMIN CHECK] Fetched member, status: ${res.status}`);
		const text = await res.text();
		console.log(`[ADMIN CHECK] API response for user ${userId}:`, text);

		if (!res.ok) {
			console.log(
				`[ADMIN CHECK] User ${userId} not found in guild or API error.`,
			);
			adminCache.set(userId, {
				isAdmin: false,
				expires: now + ADMIN_CACHE_DURATION,
			});
			return false;
		}
		const member = JSON.parse(text);

		const ADMINISTRATOR = 0x00000008;

		const rolesRes = await fetch(
			`https://discord.com/api/v10/guilds/${guildId}/roles`,
			{
				headers: { Authorization: `Bot ${botToken}` },
			},
		);
		console.log(`[ADMIN CHECK] Fetched roles, status: ${rolesRes.status}`);
		const rolesText = await rolesRes.text();
		const roles = JSON.parse(rolesText);

		const memberRoleIds = member.roles || [];
		console.log(`[ADMIN CHECK] User ${userId} roles:`, memberRoleIds);

		for (const roleId of memberRoleIds) {
			const role = roles.find((r) => r.id === roleId);
			if (role) {
				console.log(
					`[ADMIN CHECK] User ${userId} role ${role.name || role.id} permissions: ${role.permissions}`,
				);
				if (BigInt(role.permissions) & BigInt(ADMINISTRATOR)) {
					console.log(
						`[ADMIN CHECK] User ${userId} is admin via role ${role.name || role.id}`,
					);
					adminCache.set(userId, {
						isAdmin: true,
						expires: now + ADMIN_CACHE_DURATION,
					});
					return true;
				}
			}
		}
		console.log(`[ADMIN CHECK] User ${userId} is not admin`);
		adminCache.set(userId, {
			isAdmin: false,
			expires: now + ADMIN_CACHE_DURATION,
		});
		return false;
	} catch (err) {
		console.error("Failed to check admin status:", err);
		adminCache.set(userId, {
			isAdmin: false,
			expires: now + ADMIN_CACHE_DURATION,
		});
		return false;
	}
}
async function ensureAdmin(req, res, next) {
	if (!req.isAuthenticated() || !req.user) {
		return res.redirect("/login");
	}
	const isAdmin = await isUserAdmin(req.user.id);
	if (isAdmin) return next();
	return res.status(403).render("error", {
		user: req.user,
		error: "You do not have permission to access this page.",
		active: "",
	});
}

// --- Helper to fetch Discord channels from bot ---
async function fetchDiscordChannels() {
	try {
		const apiUrl = BOT_API_URL.replace(/\/api\/post-event$/, "/api/channels");
		const response = await fetch(apiUrl, {
			headers: {
				Authorization: `Bearer ${BOT_API_SECRET}`,
			},
		});
		if (response.ok) {
			return await response.json();
		}
	} catch (err) {
		console.error("Failed to fetch channels from bot:", err);
	}
	return [];
}

// --- PASSPORT DISCORD SETUP ---
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
	new DiscordStrategy(
		{
			clientID: CLIENT_ID,
			clientSecret: CLIENT_SECRET,
			callbackURL: CALLBACK_URL,
			scope: ["identify"],
		},
		(accessToken, refreshToken, profile, done) => {
			process.nextTick(() => done(null, profile));
		},
	),
);

// --- EXPRESS APP ---
const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(
	session({
		secret: SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
	}),
);
app.use(passport.initialize());
app.use(passport.session());

// --- MIDDLEWARE ---
function ensureAuth(req, res, next) {
	if (req.isAuthenticated()) return next();
	res.redirect("/login");
}

// --- ROUTES ---

// Home: Show dashboard landing page
app.get("/", (req, res) => {
	res.render("home", {
		user: req.user,
		active: "home",
	});
});

// Events list
app.get("/events", async (req, res) => {
	console.log("Events route hit, user:", req.user ? req.user.id : "none");
	let isAdmin = false;
	if (req.user) {
		console.log("About to call isUserAdmin for:", req.user.id);
		isAdmin = await isUserAdmin(req.user.id);
	}
	const events = await db.all("SELECT * FROM events ORDER BY time ASC");
	res.render("events", {
		user: req.user,
		events,
		alert: req.query.alert,
		error: req.query.error,
		isAdmin,
		active: "events",
	});
});

// Event creation form
app.get("/events/new", ensureAdmin, async (req, res) => {
	const channelsData = await fetchDiscordChannels();
	res.render("event_form", {
		user: req.user,
		event: null,
		action: "Create",
		DISCORD_CHANNELS: channelsData,
		isAdmin: true,
		active: "events",
	});
});

// Event edit form
app.get("/events/edit/:id", ensureAdmin, async (req, res) => {
	const event = await db.get(
		"SELECT * FROM events WHERE id = ?",
		req.params.id,
	);
	if (!event) return res.redirect("/events?error=Event not found");

	const channels = await fetchDiscordChannels();
	res.render("event_form", {
		user: req.user,
		event,
		action: "Edit",
		DISCORD_CHANNELS: channels,
		isAdmin: true,
		active: "events",
	});
});

app.post("/events/new", ensureAdmin, async (req, res) => {
	const { title, description, time, location, channelId } = req.body;
	if (!title || !time || !channelId)
		return res.redirect("/events?error=Title, time, and channel required");

	const id = Date.now().toString();
	const eventTime = Math.floor(new Date(time).getTime() / 1000);

	// --- POST TO DISCORD BOT API ---
	let messageId = null;
	try {
		const safeDescription = description?.trim()
			? description.trim()
			: "No description provided.";
		const event = {
			id,
			title,
			description: safeDescription,
			time: eventTime,
			location,
			image: null,
		};
		const response = await fetch(BOT_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${BOT_API_SECRET}`,
			},
			body: JSON.stringify({ channelId, event }),
		});
		const data = await response.json();
		if (!response.ok) {
			console.error("Bot API error:", data);
			return res.redirect("/events?error=Failed to post event to Discord.");
		}
		messageId = data.messageId;
	} catch (err) {
		console.error("Failed to post event to Discord:", err);
		return res.redirect("/events?error=Failed to post event to Discord.");
	}

	// Store event in DB, including channelId and messageId
	await db.run(
		"INSERT INTO events (id, title, description, time, location, creator_id, channel_id, message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		id,
		title,
		description,
		eventTime,
		location,
		req.user.id,
		channelId,
		messageId,
	);

	res.redirect("/events?alert=Event created!");
});

// Edit event
app.post("/events/edit/:id", ensureAdmin, async (req, res) => {
	const { title, description, time, location, channelId } = req.body;
	await db.run(
		"UPDATE events SET title = ?, description = ?, time = ?, location = ?, channel_id = ? WHERE id = ?",
		title,
		description,
		Math.floor(new Date(time).getTime() / 1000),
		location,
		channelId,
		req.params.id,
	);
	res.redirect("/events?alert=Event updated!");
});

// Delete event
app.post("/events/delete/:id", ensureAdmin, async (req, res) => {
	// Fetch event to get channel_id and message_id
	const event = await db.get(
		"SELECT * FROM events WHERE id = ?",
		req.params.id,
	);

	// Try to delete the Discord message if info is present
	if (event?.channel_id && event.message_id) {
		try {
			await fetch(
				BOT_API_URL.replace(/\/api\/post-event$/, "/api/delete-message"),
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${BOT_API_SECRET}`,
					},
					body: JSON.stringify({
						channelId: event.channel_id,
						messageId: event.message_id,
					}),
				},
			);
		} catch (err) {
			console.error("Failed to delete Discord message:", err);
			// Optionally, you can show a warning to the user
		}
	}

	// Delete the event from the DB
	await db.run("DELETE FROM events WHERE id = ?", req.params.id);
	res.redirect("/events?alert=Event deleted!");
});

// Cert creation form
app.get("/certs/new", ensureAdmin, (req, res) => {
	res.render("cert_form", {
		user: req.user,
		cert: null,
		action: "Create",
		isAdmin: true,
		active: "certs",
	});
});

// Cert edit form
app.get("/certs/edit/:id", ensureAdmin, async (req, res) => {
	const cert = await db.get(
		"SELECT * FROM certifications WHERE id = ?",
		req.params.id,
	);
	if (!cert) return res.redirect("/certs?error=Certification not found");
	res.render("cert_form", {
		user: req.user,
		cert,
		action: "Edit",
		isAdmin: true,
		active: "certs",
	});
});

// Create cert
app.post("/certs/new", ensureAdmin, async (req, res) => {
	const { name, description } = req.body;
	if (!name) return res.redirect("/certs?error=Name required");
	const id = Date.now().toString();
	await db.run(
		"INSERT INTO certifications (id, name, description) VALUES (?, ?, ?)",
		id,
		name,
		description,
	);
	res.redirect("/certs?alert=Certification created!");
});

// Edit cert
app.post("/certs/edit/:id", ensureAdmin, async (req, res) => {
	const { name, description } = req.body;
	await db.run(
		"UPDATE certifications SET name = ?, description = ? WHERE id = ?",
		name,
		description,
		req.params.id,
	);
	res.redirect("/certs?alert=Certification updated!");
});

// Delete cert
app.post("/certs/delete/:id", ensureAdmin, async (req, res) => {
	await db.run("DELETE FROM certifications WHERE id = ?", req.params.id);
	res.redirect("/certs?alert=Certification deleted!");
});

app.get("/certs", async (req, res) => {
	const certs = await db.all("SELECT * FROM certifications ORDER BY name ASC");
	let isAdmin = false;
	let userRequests = [];
	if (req.user) {
		isAdmin = await isUserAdmin(req.user.id);
		userRequests = await db.all(
			"SELECT * FROM certification_requests WHERE user_id = ?",
			req.user.id,
		);
	}
	res.render("certs", {
		user: req.user,
		certs,
		userRequests, // <-- always pass this!
		alert: req.query.alert,
		error: req.query.error,
		isAdmin,
		active: "certs",
	});
});

app.get("/my-certs", ensureAuth, async (req, res) => {
	const userId = req.user.id;
	const certs = await db.all("SELECT * FROM certifications ORDER BY name ASC");
	const requests = await db.all(
		"SELECT cr.*, c.name AS cert_name, c.description AS cert_description FROM certification_requests cr JOIN certifications c ON cr.cert_id = c.id WHERE cr.user_id = ? ORDER BY cr.requested_at DESC",
		userId,
	);
	res.render("my_certs", {
		user: req.user,
		certs,
		requests,
		active: "my-certs",
	});
});

app.post("/certs/request/:id", ensureAuth, async (req, res) => {
	const certId = req.params.id;
	const userId = req.user.id;
	const cert = await db.get(
		"SELECT * FROM certifications WHERE id = ?",
		certId,
	);

	const existing = await db.get(
		"SELECT * FROM certification_requests WHERE user_id = ? AND cert_id = ? AND status IN ('pending', 'approved')",
		userId,
		certId,
	);
	if (existing)
		return res.redirect(
			"/certs?error=You already have a pending or approved request for this cert.",
		);

	const requestId = Date.now().toString();
	await db.run(
		"INSERT INTO certification_requests (id, user_id, cert_id, requested_at) VALUES (?, ?, ?, ?)",
		requestId,
		userId,
		certId,
		new Date().toISOString(),
	);

	// --- POST TO DISCORD BOT API ---
	try {
		await fetch(
			process.env.BOT_API_URL.replace(
				/\/api\/post-event$/,
				"/api/request-cert",
			),
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${process.env.BOT_API_SECRET}`,
				},
				body: JSON.stringify({
					userId,
					cert,
					requestId,
				}),
			},
		);
	} catch (err) {
		console.error("Failed to post cert request to Discord:", err);
		// Optionally, show a warning to the user
	}

	res.redirect("/certs?alert=Certification requested!");
});

app.get("/test-admin", ensureAuth, async (req, res) => {
	console.log("Test admin route hit, user:", req.user ? req.user.id : "none");
	const isAdmin = await isUserAdmin(req.user.id);
	res.send(`User ${req.user.id} isAdmin: ${isAdmin}`);
});

app.get("/clear-admin-cache", ensureAuth, (req, res) => {
	adminCache.delete(req.user.id);
	res.send("Admin cache cleared for your user.");
});

// --- Discord Auth ---
app.get("/login", passport.authenticate("discord"));
app.get(
	"/auth/discord/callback",
	passport.authenticate("discord", { failureRedirect: "/" }),
	(req, res) => res.redirect("/"),
);

app.get("/logout", (req, res) => {
	req.logout(() => res.redirect("/"));
});

// Profile
app.get("/profile", ensureAuth, (req, res) => {
	res.render("profile", { user: req.user, active: "" });
});

app.get("/tos", (req, res) => {
	res.render("tos", { user: req.user, active: "" });
});
app.get("/privacy", (req, res) => {
	res.render("privacy", { user: req.user, active: "" });
});

// --- STARTUP ---
async function start() {
	if (!fs.existsSync(dbPath)) {
		console.error("Database file not found:", dbPath);
		process.exit(1);
	}
	db = await open({ filename: dbPath, driver: sqlite3.Database });

	app.listen(PORT, () => {
		console.log(`Dashboard running at http://localhost:${PORT}`);
	});
}

start();
