-- Team members can have more than one job: the role sets what they may do in the CRM (owner, administrator, operator…),
-- the duties say what work they do (evaluator, inspector). E.g. the business owner is owner + evaluator + inspector.
ALTER TABLE users ADD COLUMN duties TEXT;                          -- comma list: evaluator,inspector
UPDATE users SET duties = role WHERE kind = 'internal' AND role IN ('evaluator', 'inspector');
