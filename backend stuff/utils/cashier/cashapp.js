const cashierCheckSendCashappDepositData = (data) => {
  if (data === undefined || data === null) {
    throw new Error("Something went wrong. Please try again in a few seconds.");
  } else if (
    data.amount === undefined ||
    isNaN(data.amount) === true ||
    Math.floor(data.amount) < 1.42
  ) {
    throw new Error("Your provided deposit amount is invalid.");
  } else if (
    Math.floor(data.amount) < Math.floor(process.env.CREDIT_MIN_AMOUNT * 1.42)
  ) {
    throw new Error(
      `You can only deposit a min amount of $${parseFloat(
        process.env.CREDIT_MIN_AMOUNT
      )
        .toFixed(2)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.`
    );
  }
};

const generateUniqueVerificationNote = () => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const noteLength = 10;

  let note = "";
  for (let i = 0; i < noteLength; i++) {
    note += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return note;
};

module.exports = {
  cashierCheckSendCashappDepositData,
  generateUniqueVerificationNote,
};
