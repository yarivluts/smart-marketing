-- Landed quality scores must be within the valid 0-100 range when present --
-- a malformed/missing score parses to null via `growthos_try_cast` (an
-- expected outcome, not a rule-breaking one, same tolerant-cast posture
-- `assert_survey_response_score_in_range.sql` already established).
select *
from {{ ref('fact_signup_quality_score') }}
where quality_score is not null
  and (quality_score < 0 or quality_score > 100)
