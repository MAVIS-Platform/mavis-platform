package com.mavis.analyzer.runtime.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SecretRedactorTest {

    @Test
    void redactsAllProviderTokensJwtKeysCredentialsAndPreservesPlaceholders() {
        String raw = String.join("\n",
                "openai=sk-proj-abc1234567890abcdef1234",
                "gemini=AIzaSyD98765432109876543210abcd",
                "github=ghp_1234567890abcdefghijklmnop",
                "aws=AKIAIOSFODNN7EXAMPLE",
                "jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
                "Authorization: Bearer super_secret_bearer_token",
                "jdbc:postgresql://admin:dbSecret99@localhost:5432/mavis",
                "api_key: \"inlineSecretValue\"",
                "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEtest\n-----END RSA PRIVATE KEY-----",
                "Authorization: Bearer {{AUTH_TOKEN}}");

        String redacted = SecretRedactor.redactString(raw);

        assertThat(redacted).doesNotContain("sk-proj-abc1234567890abcdef1234");
        assertThat(redacted).doesNotContain("AIzaSyD98765432109876543210abcd");
        assertThat(redacted).doesNotContain("ghp_1234567890abcdefghijklmnop");
        assertThat(redacted).doesNotContain("AKIAIOSFODNN7EXAMPLE");
        assertThat(redacted).doesNotContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
        assertThat(redacted).doesNotContain("super_secret_bearer_token");
        assertThat(redacted).doesNotContain("dbSecret99");
        assertThat(redacted).doesNotContain("inlineSecretValue");
        assertThat(redacted).doesNotContain("MIIEowIBAAKCAQEtest");
        assertThat(redacted).contains("[REDACTED]");
    }

    @Test
    void leavesSafeCodeExcerptsAndTemplateVariablesUntouched() {
        String safe = "return orderRepository.findById(orderId); String placeholder = \"{{AUTH_TOKEN}}\";";
        assertThat(SecretRedactor.redactString(safe)).isEqualTo(safe);
    }
}
