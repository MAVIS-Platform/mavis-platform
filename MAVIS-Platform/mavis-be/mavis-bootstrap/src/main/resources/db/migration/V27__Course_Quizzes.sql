CREATE TABLE course_quizzes (
    assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    reference_model_id UUID NOT NULL REFERENCES model_versions(id),
    lesson TEXT NOT NULL,
    pass_percent INTEGER NOT NULL CHECK (pass_percent BETWEEN 1 AND 100),
    questions JSONB NOT NULL CHECK (jsonb_typeof(questions) = 'array'),
    PRIMARY KEY (assignment_id, version)
);

CREATE TABLE course_quiz_attempts (
    assignment_id UUID NOT NULL,
    quiz_version INTEGER NOT NULL,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL,
    answers JSONB NOT NULL,
    correct_count INTEGER NOT NULL CHECK (correct_count >= 0),
    passed BOOLEAN NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    PRIMARY KEY (assignment_id, student_id, attempt_id),
    FOREIGN KEY (assignment_id, quiz_version) REFERENCES course_quizzes(assignment_id, version) ON DELETE CASCADE
);
