const mongoose = require("mongoose");

const creditTransactionSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    data: {
      providerId: { type: String, required: true },
      providerUrl: { type: String, required: true },
      currency: { type: String, required: true },
      amountCurrency: { type: Number, required: true },
    },
    type: { type: String, required: true },
    user: { type: mongoose.Schema.ObjectId, ref: "User", required: true },
    state: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CreditTransaction", creditTransactionSchema);
