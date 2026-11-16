package com.mavis.analyzer.runtime.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.exception.BusinessException;
import java.util.Set;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class PreparedStudioTopologyTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final Set<String> services = Set.of("orders", "payment", "orders-payment");

    private com.fasterxml.jackson.databind.JsonNode profile(String controller) throws Exception {
        return mapper.readTree("""
          {"studioTopology":{"version":1,"blocks":[
            {"service":"orders","label":"Orders","canScale":true},
            {"service":"payment","label":"Payment","initiallyStopped":true}
          ],"connections":[{"from":"orders","to":"payment","controllerService":"%s","protocol":"HTTP","initiallyStopped":true,"password":"must-not-be-exposed"}]}}
          """.formatted(controller));
    }

    @Test void exposesOnlyBoundedPublicFields() throws Exception {
        var result = PreparedStudioTopology.read(profile("orders-payment"), services, mapper);
        assertEquals(2, result.path("blocks").size());
        assertTrue(result.path("blocks").get(1).path("initiallyStopped").asBoolean());
        assertFalse(result.toString().contains("password"));
    }

    @Test void rejectsControllerThatIsAlsoAnApplicationBlock() {
        assertThrows(BusinessException.class, () -> PreparedStudioTopology.read(profile("orders"), services, mapper));
    }

    @Test void rejectsUnpinnedController() {
        assertThrows(BusinessException.class, () -> PreparedStudioTopology.read(profile("external"), services, mapper));
    }

    @Test void existingProfilesRemainSupported() throws Exception {
        assertNull(PreparedStudioTopology.read(mapper.readTree("{}"), services, mapper));
    }
}
