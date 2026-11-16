-- Polls belong to individual Eggs and workspaces, even when their questions match.
-- Preserve their IDs, answers, and responses; only remove the global text constraint.
alter table public.polls
  drop constraint if exists polls_question_key;
