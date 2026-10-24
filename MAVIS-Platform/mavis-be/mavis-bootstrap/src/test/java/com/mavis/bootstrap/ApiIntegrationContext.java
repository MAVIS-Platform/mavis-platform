package com.mavis.bootstrap;
import com.mavis.common.utils.SecurityUtils;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
/** SecurityUtils bridges static callers; cached Spring test contexts must restore their own auth mode. */
abstract class ApiIntegrationContext {
 @Autowired private Environment testEnvironment;
 @BeforeEach void restoreContextAuthMode(){SecurityUtils.setDevBypassEnabled(testEnvironment.getProperty("mavis.security.dev-bypass-enabled",Boolean.class,true));}
}
