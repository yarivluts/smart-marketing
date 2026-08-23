-- Landed NPS scores must be within the valid 0-10 range when present -- a
-- malformed/missing score parses to null via `growthos_try_cast` (an
-- expected outcome, not a rule-breaking one, same tolerant-cast posture
-- `assert_measure_values_are_non_negative.sql` already established).
select *
from {{ ref('fact_survey_response') }}
where score is not null
  and (score < 0 or score > 10)
