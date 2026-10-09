-- Higher-Order Multi-Touch Attribution Macros & Procedures (KAN-312):
-- Provides helper macros for Markov transition probability matrices and removal effect evaluation.

{% macro markov_transition_probability_query(markov_model_ref) %}
select
    organization_id,
    project_id,
    environment_id,
    from_channel,
    to_channel,
    transition_count,
    transition_probability
from {{ ref(markov_model_ref) }}
{% endmacro %}
