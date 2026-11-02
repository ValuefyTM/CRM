-- A collaborator's portal order: the collaborator who sent it is its referral ("Recomandată de"), on the order and on
-- the reports opened from it (new orders get it when they are made).
UPDATE orders SET referral_user_id = created_by
  WHERE source = 'partner' AND referral_user_id IS NULL AND created_by IN (SELECT id FROM users WHERE kind = 'partner');
UPDATE reports SET referral_user_id = (SELECT o.referral_user_id FROM orders o WHERE o.id = reports.order_id)
  WHERE referral_user_id IS NULL AND order_id IN (SELECT id FROM orders WHERE source = 'partner' AND referral_user_id IS NOT NULL);
