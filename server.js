// Import necessary libraries
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const cors = require("cors");
const User = require("./User");
const Transaction = require("./Transaction");
const formatCreditCardNumber = require("./utils");

const app = express();
const PORT = process.env.PORT | 3000;

app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB where the URL is an environment variable
mongoose.connect(process.env.DB_URI, {
	useNewUrlParser: true,
	useUnifiedTopology: true,
});

// Signup endpoint
app.post("/signup", async (req, res) => {
	try {
		const {
			firstName,
			lastName,
			address,
			birthday,
			username,
			password,
			balance,
		} = req.body;

		// Check if the username already exists
		const existingUser = await User.findOne({ username });
		if (existingUser) {
			return res.status(409).json({ message: "Username already exists" });
		}

		// Create a new user instance
		const user = new User({
			firstName,
			lastName,
			address,
			birthday,
			username,
			password,
			balance,
		});

		// Save the user to the database
		await user.save();

		res.status(201).json({ message: "User created successfully" });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: "Internal server error" });
	}
});

app.post("/login", async (req, res) => {
	const { username, password } = req.body;

	try {
		console.log("Received login request:", { username, password });

		const existingUser = await User.findOne({ username });
		if (!existingUser) {
			console.log("Username not found");
			return res.status(400).json({ error: "Username not found" });
		}

		if (password !== existingUser.password) {
			console.log("Incorrect password");
			return res.status(401).json({ error: "Incorrect password" });
		}

		console.log("Login successful");
		res.status(200).json({ message: "Login successful" });
	} catch (error) {
		console.error("Error:", error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

app.get("/users", async (req, res) => {
	const users = await User.find({});
	res.send(users);
});

// ------------ DANGER ZONE ------------------------
app.delete("/users", async (req, res) => {
	try {
		await User.deleteMany({});
		res.send("All users have been deleted.");
	} catch (error) {
		res.status(500).send(error.message);
	}
});
app.delete("/transactions", async (req, res) => {
	try {
		await Transaction.deleteMany();
		Transaction.collection.dropIndexes(function (err, results) {});

		return res
			.status(200)
			.json({ message: "All transactions deleted successfully" });
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: "Internal server error" });
	}
});
// ------------ DANGER ZONE ------------------------

app.get("/users/:username", async (req, res) => {
	const { username } = req.params;
	try {
		const user = await User.findOne({ username });
		if (!user) {
			return res.status(404).send("User not found");
		}

		const formattedUser = {
			_id: user._id,
			firstName: user.firstName,
			lastName: user.lastName,
			address: user.address,
			birthday: user.birthday.toLocaleDateString(),
			username: user.username,
			password: user.password,
			creditCardNumber: user.creditCardNumber,
			__v: user.__v,
		};

		res.send(formattedUser);
	} catch (error) {
		console.error(error);
		res.status(500).send("Server error");
	}
});

app.get("/cardholders/:cardNumber", async (req, res) => {
	console.log("GET: Cardholders");
	const { cardNumber } = req.params;
	try {
		const user = await User.findOne({ creditCardNumber: cardNumber });
		if (!user) {
			return res.status(404).send({ msg: "Cardholder not found" });
		}

		const formattedUser = {
			_id: user._id,
			name: user.firstName + " " + user.lastName,
			address: user.address,
			birthday: user.birthday.toLocaleDateString(),
			username: user.username,
			creditCardNumber: formatCreditCardNumber(user.creditCardNumber),
			__v: user.__v,
		};

		res.send(formattedUser);
	} catch (error) {
		console.error(error);
		res.status(500).send("Server error");
	}
});

// Endpoint for getting user balance
app.get("/getUserBalance/:username", async (req, res) => {
	const username = req.params.username;

	try {
		const user = await User.findOne({ username });

		if (!user) return res.status(404).json({ error: "User not found" });

		res.status(200).json({ balance: user.balance });
	} catch (error) {
		console.error("Error:", error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

// Endpoint for getting credit card information
app.get("/getCreditCardInfo/:username", async (req, res) => {
	const username = req.params.username;

	try {
		const user = await User.findOne({ username });

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		let formattedCardNumber = "";
		for (let i = 0; i < user.creditCardNumber.length; i++) {
			if (i > 0 && i % 4 === 0) {
				formattedCardNumber += " ";
			}
			formattedCardNumber += user.creditCardNumber[i];
		}

		yearStr = user.expiryDate.getFullYear().toString();
		const formattedExpiry =
			user.expiryDate.getMonth() +
			"/" +
			yearStr.charAt(2) +
			yearStr.charAt(3);

		const formattedName = user.firstName + " " + user.lastName;

		const formattedBalance = user.balance.toLocaleString();

		// Extract and send credit card information in the response
		const creditCardInfo = {
			cvv: user.cvv,
			expiryDate: formattedExpiry,
			name: formattedName,
			cardNumber: formattedCardNumber,
			balance: formattedBalance,
		};

		res.status(200).json(creditCardInfo);
	} catch (error) {
		console.error("Error:", error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

app.post("/transfer", async (req, res) => {
	try {
		const { senderUsername, receiverUsername, amount } = req.body;

		// Find sender and receiver users
		const sender = await User.findOne({ username: senderUsername });
		const receiver = await User.findOne({ username: receiverUsername });

		// Check if sender and receiver exist
		if (!sender || !receiver) {
			return res.status(404).json({ error: "User not found" });
		}

		// Check if sender has enough balance
		if (sender.balance < amount) {
			return res.status(400).json({ error: "Insufficient balance" });
		}

		// Update sender's balance
		sender.balance -= amount;
		await sender.save();

		// Update receiver's balance
		receiver.balance += amount;
		await receiver.save();

		// Create a new transaction
		const transaction = new Transaction({
			senderUsername: sender.username,
			senderName: `${sender.firstName} ${sender.lastName}`,
			senderCardNumber: sender.creditCardNumber,
			receiverUsername: receiver.username,
			receiverName: `${receiver.firstName} ${receiver.lastName}`,
			receiverCardNumber: receiver.creditCardNumber,
			amount,
		});
		await transaction.save();

		return res
			.status(200)
			.json({ message: "Money transferred successfully" });
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: "Internal server error" });
	}
});

app.get("/transactions", async (req, res) => {
	try {
		const transactions = await Transaction.find();
		return res.status(200).json(transactions);
	} catch (error) {
		console.error(error);
		return res.status(500).json({ error: "Internal server error" });
	}
});

app.get("/transactions/:username", async (req, res) => {
	try {
		const username = req.params.username;

		const user = await User.findOne({ username });

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		// Find all transactions where the sender or receiver username matches
		const transactions = await Transaction.find({
			$or: [{ senderUsername: username }, { receiverUsername: username }],
		}).sort({ date: -1 });

		const formattedTransactions = [];

		transactions.forEach((t) => {
			if (t.senderUsername == username) {
				formattedTransactions.push({
					title: "Outgoing",
					name: t.receiverName,
					amount: t.amount.toLocaleString(),
					date: `${t.date.getFullYear()}/${
						t.date.getMonth() + 1
					}/${t.date.getDay()}`,
				});
			} else {
				formattedTransactions.push({
					title: "Incoming",
					name: t.senderName,
					amount: t.amount.toLocaleString(),
					date: `${t.date.getFullYear()}/${
						t.date.getMonth() + 1
					}/${t.date.getDay()}`,
				});
			}
		});
		res.status(200).json(formattedTransactions);
	} catch (err) {
		res.status(500).json({
			error: "An error occurred while retrieving transactions",
		});
	}
});

app.get("/transactions/latest/:username", async (req, res) => {
	try {
		const username = req.params.username;

		const user = await User.findOne({ username });

		if (!user) {
			return res.status(404).json({ error: "User not found" });
		}

		const transactions = await Transaction.find({
			$or: [{ senderUsername: username }, { receiverUsername: username }],
		})
			.sort({ date: -1 })
			.limit(5);

		const formattedTransactions = [];

		transactions.forEach((t) => {
			if (t.senderUsername == username) {
				formattedTransactions.push({
					title: "Outgoing",
					name: t.receiverName,
					amount: t.amount.toLocaleString(),
					date: `${t.date.getFullYear()}/${
						t.date.getMonth() + 1
					}/${t.date.getDay()}`,
				});
			} else {
				formattedTransactions.push({
					title: "Incoming",
					name: t.senderName,
					amount: t.amount.toLocaleString(),
					date: `${t.date.getFullYear()}/${
						t.date.getMonth() + 1
					}/${t.date.getDay()}`,
				});
			}
		});
		res.status(200).json(formattedTransactions);
	} catch (err) {
		res.status(500).json({
			error: "An error occurred while retrieving transactions",
		});
	}
});

// Start the server
app.listen(PORT, () => {
	console.log(`Server is running on PORT ${PORT}`);
});
