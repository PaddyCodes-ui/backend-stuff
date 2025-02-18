// Load database models
const User = require("../../../database/models/User");

// Load middleware
const { rateLimiter } = require("../../../middleware/rateLimiter");

// Load utils
const {
  socketCheckUserData,
  socketCheckAntiSpam,
  socketRemoveAntiSpam,
} = require("../../../utils/socket");
const { settingCheck } = require("../../../utils/setting");

// Load controllers
const {
  cashierSendCreditDepositSocket,
  cashierCheckCreditDepositSocket,
} = require("../../../controllers/cashier/credit");

module.exports = (io, socket) => {
  socket.on("sendCreditDeposit", async (data, callback) => {
    if (callback === undefined || typeof callback !== "function") {
      return;
    }
    if (socket.decoded !== undefined && socket.decoded !== null) {
      try {
        const identifier =
          socket.handshake.headers["cf-connecting-ip"] ||
          socket.conn.remoteAddress;
        await rateLimiter.consume(identifier);
        await socketCheckAntiSpam(socket.decoded._id);
        try {
          const user = await User.findById(socket.decoded._id)
            .select("username avatar rank mute ban")
            .lean();
          socketCheckUserData(user, true);
          settingCheck(user, "credit.deposit.enabled");
          cashierSendCreditDepositSocket(io, socket, user, data, callback);
        } catch (err) {
          socketRemoveAntiSpam(socket.decoded._id);
          callback({
            success: false,
            error: { type: "error", message: err.message },
          });
        }
      } catch (err) {
        callback({
          success: false,
          error: {
            type: "error",
            message:
              err.message !== undefined
                ? err.message
                : "You need to slow down, you have send to many request. Try again in a minute.",
          },
        });
      }
    } else {
      callback({
        success: false,
        error: {
          type: "error",
          message: "You need to sign in to perform this action.",
        },
      });
    }
  });

  socket.on("checkCreditDeposit", async (data, callback) => {
    console.log("checkCreditDeposit");
    if (callback === undefined || typeof callback !== "function") {
      return;
    }
    if (socket.decoded !== undefined && socket.decoded !== null) {
      try {
        const identifier =
          socket.handshake.headers["cf-connecting-ip"] ||
          socket.conn.remoteAddress;
        await rateLimiter.consume(identifier);
        await socketCheckAntiSpam(socket.decoded._id);
        try {
          const user = await User.findById(socket.decoded._id)
            .select("username avatar rank mute ban")
            .lean();
          socketCheckUserData(user, true);
          settingCheck(user, "credit.deposit.enabled");
          cashierCheckCreditDepositSocket(io, socket, user, data, callback);
        } catch (err) {
          socketRemoveAntiSpam(socket.decoded._id);
          callback({
            success: false,
            error: { type: "error", message: err.message },
          });
        }
      } catch (err) {
        callback({
          success: false,
          error: {
            type: "error",
            message:
              err.message !== undefined
                ? err.message
                : "You need to slow down, you have send to many request. Try again in a minute.",
          },
        });
      }
    } else {
      callback({
        success: false,
        error: {
          type: "error",
          message: "You need to sign in to perform this action.",
        },
      });
    }
  });
};
