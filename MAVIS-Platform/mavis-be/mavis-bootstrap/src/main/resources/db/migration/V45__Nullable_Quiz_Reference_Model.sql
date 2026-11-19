-- Allow Theory-only Course Labs (without a pinned reference repository) to author and publish Quizzes.
ALTER TABLE course_quizzes
    ALTER COLUMN reference_model_id DROP NOT NULL;
