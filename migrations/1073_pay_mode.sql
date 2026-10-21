-- How a team member is paid: "commission" (the shares of the fee on their user page, on the monthly payout
-- statement) or "profit" (a percent of the net profit on their reports; no payout statement). The owner is neither.
ALTER TABLE users ADD COLUMN pay_mode TEXT;
UPDATE users SET pay_mode = 'profit' WHERE profit_share > 0;
