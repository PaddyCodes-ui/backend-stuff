// Load database models
const User = require("../../../database/models/User");
const CreditTransaction = require("../../../database/models/CreditTransaction");
const Report = require("../../../database/models/Report");

// Load utils
const { socketRemoveAntiSpam } = require("../../../utils/socket");
const {
  cashierCheckSendCreditDepositData,
  cashierCreditCreateSignature,
  cashierCreditCreateTransaction,
  cashierCreditCreateUrl,
  generateUniqueVerificationNote,
} = require("../../../utils/cashier/credit");
const { default: axios } = require("axios");

const CASH_TAGS = ["$Desking9"];

const cashierSendCreditDepositSocket = async (
  io,
  socket,
  user,
  data,
  callback
) => {
  try {
    // Validate sent data
    cashierCheckSendCreditDepositData(data);

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
    })
      .select("data type user state")
      .lean();

    if (transactionDatabase === null) {
      transactionDatabase = await CreditTransaction.create({
        data: {
          providerId: verificationNote, // Using verification note as providerId for tracking
          providerUrl: cashTag, // Using cashTag as providerUrl for tracking
        },
        type: "deposit",
        user: user._id,
        amount,
        state: "created",
      });

      transactionDatabase = transactionDatabase.toObject();
    }

    callback({ success: true, note: verificationNote, cashtag: cashTag });

    socketRemoveAntiSpam(user._id);
  } catch (err) {
    socketRemoveAntiSpam(socket.decoded._id);
    callback({
      success: false,
      error: { type: "error", message: err.message },
    });
  }
};

const cashierCheckCreditDepositSocket = async (
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

// const cashierSendCreditDepositSocket = async(io, socket, user, data, callback) => {
//     try {
//         // Validate sent data
//         cashierCheckSendCreditDepositData(data);

//         // Get active user steam transaction from database
//         let transactionDatabase = await CreditTransaction.findOne({ type: 'deposit', user: user._id, state: 'created' }).select('data type user state').lean();

//         if(transactionDatabase === null) {
//             // Create body object
//             let body = { userId: user._id.toString() };

//             // Create signature and add to body
//             body.signature = cashierCreditCreateSignature(body);

//             // Create zebrasmarket transaction
//             const transactionData = await cashierCreditCreateTransaction(body);

//             // Create new credit transaction in database
//             transactionDatabase = await CreditTransaction.create({
//                 data: {
//                     providerId: transactionData.orderId,
//                     providerUrl: transactionData.url
//                 },
//                 type: 'deposit',
//                 user: user._id,
//                 state: 'created'
//             });

//             // Convert transaction to javascript object
//             transactionDatabase = transactionDatabase.toObject();
//         }

//         // Get sent amount
//         const amount = String(Math.floor(data.amount) / 1000 * 3 / 1000);

//         // Get zebrasmarket url
//         const urlData = await cashierCreditCreateUrl(transactionDatabase.data.providerUrl, amount);

//         callback({ success: true, url: urlData });

//         socketRemoveAntiSpam(user._id);
//     } catch(err) {
//         socketRemoveAntiSpam(socket.decoded._id);
//         callback({ success: false, error: { type: 'error', message: err.message } });
//     }
// }

module.exports = {
  cashierSendCreditDepositSocket,
  cashierCheckCreditDepositSocket,
};
