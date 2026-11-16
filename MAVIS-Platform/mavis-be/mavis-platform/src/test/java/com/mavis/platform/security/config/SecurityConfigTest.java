package com.mavis.platform.security.config;

import com.mavis.platform.security.filter.JwtAuthenticationFilter;
import com.mavis.platform.security.jwt.JwtUtil;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mock.web.MockServletContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import static org.mockito.Mockito.mock;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup;

class SecurityConfigTest {
    @Configuration @EnableWebMvc
    static class TestConfig {
        @Bean JwtAuthenticationFilter jwtAuthenticationFilter() { return new JwtAuthenticationFilter(mock(JwtUtil.class)); }
        @Bean Probe probe() { return new Probe(); }
    }
    @RestController static class Probe {
        @GetMapping("/private") String secured() { return "private"; }
    }
    @Test void anonymousRequestsFailClosedAndBothLoopbackOriginsWork() throws Exception {
        try (var context = new AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new MockServletContext());
            context.register(SecurityConfig.class, TestConfig.class);
            context.refresh();
            var mvc = webAppContextSetup(context).apply(springSecurity()).build();
            mvc.perform(get("/private")).andExpect(status().isUnauthorized());
            for (String origin : new String[]{"http://localhost:3000", "http://127.0.0.1:3000"}) {
                mvc.perform(options("/private").header("Origin", origin).header("Access-Control-Request-Method", "GET"))
                        .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", origin));
            }
            mvc.perform(options("/private").header("Origin", "https://untrusted.invalid").header("Access-Control-Request-Method", "GET"))
                    .andExpect(status().isForbidden());
        }
    }
}
