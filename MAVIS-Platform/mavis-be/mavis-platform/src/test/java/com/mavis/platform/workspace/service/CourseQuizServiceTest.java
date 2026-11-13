package com.mavis.platform.workspace.service;

import com.mavis.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class CourseQuizServiceTest {
    @Test void gradesAtTheExactThresholdWithoutRoundingUp() {
        assertTrue(CourseQuizService.passes(7, 10, 70));
        assertFalse(CourseQuizService.passes(16, 23, 70));
        assertTrue(CourseQuizService.passes(17, 23, 70));
    }

    @Test void gradesOnlyCompleteAndValidSelections() {
        var questions = List.of(new CourseQuizService.Question("Boundary?", List.of("API", "Database"), 1));
        assertEquals(1, CourseQuizService.score(questions, List.of(1)));
        assertEquals(0, CourseQuizService.score(questions, List.of(0)));
        assertThrows(BusinessException.class, () -> CourseQuizService.score(questions, List.of()));
        assertThrows(BusinessException.class, () -> CourseQuizService.score(questions, List.of(2)));
    }
}
