package com.mavis.common.utils;
import org.junit.jupiter.api.Test;
import com.mavis.common.exception.BusinessException;
import static org.assertj.core.api.Assertions.*;
class GitHubRepositoryUrlsTest {
    @Test void canonicalIdentityAcceptsEquivalentGitHubRootUrls() {
        assertThat(GitHubRepositoryUrls.requireSame("https://github.com/OWNER/Repo.git", "https://github.com/owner/repo/"))
                .isEqualTo("https://github.com/owner/repo");
        assertThat(GitHubRepositoryUrls.normalize(null)).isNull();
    }
    @Test void rejectsNonRootAndUnsafeUrls() {
        for (String url : java.util.List.of("http://github.com/a/b", "https://other.test/a/b", "https://github.com/a/b/tree/main",
                "https://user:secret@github.com/a/b", "https://github.com/a/b?ref=main", "https://github.com/a/..")) {
            assertThatThrownBy(() -> GitHubRepositoryUrls.normalize(url)).isInstanceOf(BusinessException.class);
        }
    }
}
