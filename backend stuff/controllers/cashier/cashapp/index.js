// Load database models
const User = require("../../../database/models/User");
const CreditTransaction = require("../../../database/models/CreditTransaction");
const Report = require("../../../database/models/Report");

// Load utils
const { socketRemoveAntiSpam } = require("../../../utils/socket");
const { default: axios } = require("axios");
const {
  cashierCheckSendCashappDepositData,
  generateUniqueVerificationNote,
} = require("../../../utils/cashier/cashapp");

const CASH_TAGS = ["$Desking9"];

const cashierSendCashappDepositSocket = async (
  io,
  socket,
  user,
  data,
  callback
) => {
  try {
    // Validate sent data
    cashierCheckSendCashappDepositData(data);

    // Validate input
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0) {
      return callback({
        success: false,
        error: { type: "error", message: "Invalid deposit amount." },
      });
    }

    // Generate secure randomness
    const cashTag = CASH_TAGS[Math.floor(Math.random() * CASH_TAGS.length)];
    const verificationNote = generateUniqueVerificationNote();

    // Save deposit request to database
    let transactionDatabase = await CreditTransaction.findOne({
      type: "deposit",
      user: user._id,
      state: "created",
      amount,
    });
    if (transactionDatabase === null) {
      transactionDatabase = await CreditTransaction.create({
        data: {
          providerId: verificationNote, // Using verification note as providerId for tracking
          providerUrl: cashTag, // Using cashTag as providerUrl for tracking
          amountCurrency: amount,
          currency: "usd",
        },
        amount,
        type: "deposit",
        user: user._id,
        state: "created",
      });

      transactionDatabase = transactionDatabase.toObject();
    }
    callback({
      success: true,
      note: verificationNote,
      cashtag: cashTag,
      id: transactionDatabase._id,
      createdAt: transactionDatabase.createdAt,
      text: "text",
    });

    socketRemoveAntiSpam(user._id);
  } catch (err) {
    socketRemoveAntiSpam(socket.decoded._id);
    callback({
      success: false,
      error: { type: "error", message: err.message },
    });
  }
};

const cashierCheckCashappDepositSocket = async (
  io,
  socket,
  user,
  data,
  callback
) => {
  try {
    // Validate sent data
    const { payment_link } = data;
    if (!payment_link.startsWith("https://cash.app/payments/")) {
      console.log("error", callback);
      return callback({
        success: false,
        error: { type: "error", message: "Invalid payment link." },
      });
    }

    const startIndex = payment_link.indexOf("/payments/") + "/payments/".length;
    const endIndex = payment_link.indexOf("/receipt");
    const payment_id = payment_link.substring(startIndex, endIndex);

    const cashapp_json = `https://cash.app/receipt-json/f/${payment_id}`;
    const response = await axios.get(cashapp_json).then((res) => res.data);
    console.log(response);

    const { detail_rows, notes, header_subtext, status_treatment } = response;

    const transactionDatabase = await CreditTransaction.findOne({
      "data.providerId": notes,
    })
      .select("amount data type user state")
      .populate({ path: "user", select: "affiliates" })
      .lean();
    if (!transactionDatabase) {
      return callback({
        success: false,
        error: { type: "error", message: "Deposit request not found." },
      });
    }

    if (transactionDatabase.state === "completed") {
      return callback({
        success: false,
        error: { type: "error", message: "Deposit already claimed." },
      });
    }

    const cash_amount = parseFloat(detail_rows[0]?.value.replace(/^\$/, ""));
    // const site_value = (cash_amount * 2).toFixed(2);
    const sender_cashtag = header_subtext.split(" ")[2];

    // Get transaction amount in robux
    const site_value = Math.floor((cash_amount / 3) * 1000);

    if (
      cash_amount !== transactionDatabase.amount ||
      notes !== transactionDatabase.data.providerId
    ) {
      return callback({
        success: false,
        error: { type: "error", message: "Payment verification failed." },
      });
    }

    if (String(detail_rows[1].value) !== "Cash") {
      return callback({
        success: false,
        error: {
          type: "error",
          message: "Money must be sent with cash balance!",
        },
      });
    }

    if (String(status_treatment) !== "SUCCESS") {
      return callback({
        success: false,
        error: { type: "error", message: "Payment must be successful!" },
      });
    }

    // Create promises array
    let promises = [];

    // Add update credit transaction, user and page report queries to promises array
    promises = [
      CreditTransaction.findByIdAndUpdate(
        transactionDatabase._id,
        {
          amount: amount,
          state: "completed",
        },
        {}
      ),
      User.findByIdAndUpdate(
        transactionDatabase.user._id,
        {
          $inc: {
            balance: amount,
            "stats.deposit": amount,
            "limits.betToWithdraw": amount,
          },
          updatedAt: new Date().getTime(),
        },
        { new: true }
      )
        .select("balance xp stats rakeback mute ban verifiedAt updatedAt")
        .lean(),
      Report.findOneAndUpdate(
        { createdAt: new Date().toISOString().slice(0, 10) },
        {
          $inc: {
            "stats.total.deposit": amountFiat,
            "stats.credit.deposit": amountFiat,
          },
        },
        { upsert: true }
      ),
    ];

    // Add update users referrer query to promises array
    if (transactionDatabase.user.affiliates.referrer !== undefined) {
      promises.push(
        User.findByIdAndUpdate(
          transactionDatabase.user.affiliates.referrer,
          {
            $inc: {
              "affiliates.deposit": amount,
            },
            updatedAt: new Date().getTime(),
          },
          {}
        )
      );
    }

    // Execute promises array queries
    const dataDatabase = await Promise.all(promises);

    io.of("/general")
      .to(dataDatabase[1]._id.toString())
      .emit("user", { user: dataDatabase[1] });

    callback({
      success: true,
      message: `Successfully credited ${site_value} coins to your wallet!`,
    });
    socketRemoveAntiSpam(user._id);
  } catch (error) {
    socketRemoveAntiSpam(socket.decoded._id);
    callback({
      success: false,
      error: { type: "error", message: error.message },
    });
  }
};

module.exports = {
  cashierSendCashappDepositSocket,
  cashierCheckCashappDepositSocket,
};
