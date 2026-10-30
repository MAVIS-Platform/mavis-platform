package com.mavis.analyzer.javaanalyzer.visitor;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.mavis.analyzer.javaanalyzer.dto.CodeEvidenceDTO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class UmlClassifierVisitorTest {

    @Test
    @DisplayName("O4 CFG: early return inside if-branch terminates in ACTIVITY_FINAL without wiring returned branch into MERGE")
    @SuppressWarnings("unchecked")
    void earlyReturnDoesNotFlowIntoMerge() {
        String code = """
                package com.acme.orders;
                public class EarlyReturnService {
                    public int compute(boolean stop) {
                        if (stop) {
                            return 1;
                        }
                        return 2;
                    }
                }
                """;
        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new UmlClassifierVisitor("EarlyReturnService.java").visit(cu, evidences);

        CodeEvidenceDTO cls = evidences.stream()
                .filter(e -> "CLASS_INTERFACE".equals(e.getElementType()))
                .findFirst()
                .orElseThrow();

        Map<String, Object> uml = (Map<String, Object>) cls.getMetadata().get("umlClassifier");
        List<Map<String, Object>> cfgs = (List<Map<String, Object>>) uml.get("methodsCfg");
        assertThat(cfgs).hasSize(1);

        Map<String, Object> cfg = cfgs.get(0);
        assertThat(cfg.get("extractionCompleteness")).isEqualTo("COMPLETE");
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) cfg.get("nodes");
        List<Map<String, Object>> edges = (List<Map<String, Object>>) cfg.get("edges");

        // No MERGE node should be created because then-branch returned early
        assertThat(nodes.stream().noneMatch(n -> "MERGE".equals(n.get("kind")))).isTrue();

        Map<String, Object> ret1 = nodes.stream()
                .filter(n -> "ACTION".equals(n.get("kind")) && "return 1".equals(n.get("label")))
                .findFirst()
                .orElseThrow();
        Map<String, Object> ret2 = nodes.stream()
                .filter(n -> "ACTION".equals(n.get("kind")) && "return 2".equals(n.get("label")))
                .findFirst()
                .orElseThrow();
        Map<String, Object> dec = nodes.stream()
                .filter(n -> "DECISION".equals(n.get("kind")))
                .findFirst()
                .orElseThrow();

        // Decision connects to return 1 on [stop] and directly to return 2 on [else]
        assertThat(edges.stream().anyMatch(e ->
                dec.get("id").equals(e.get("from"))
                        && ret1.get("id").equals(e.get("to"))
                        && "[stop]".equals(e.get("guard"))
        )).isTrue();
        assertThat(edges.stream().anyMatch(e ->
                dec.get("id").equals(e.get("from"))
                        && ret2.get("id").equals(e.get("to"))
                        && "[else]".equals(e.get("guard"))
        )).isTrue();
    }

    @Test
    @DisplayName("O4 CFG: do-while executes body before bottom DECISION and emits AST OBJECT_FLOW on enum assignment")
    @SuppressWarnings("unchecked")
    void doWhileExecutesBodyBeforeDecisionAndEmitsObjectFlow() {
        String code = """
                package com.acme.orders;
                public enum OrderStatus { CREATED, VALIDATED, PAID }
                public class RetryProcessor {
                    private OrderStatus status = OrderStatus.CREATED;
                    public void retryUntilPaid(int maxAttempts) {
                        int attempts = 0;
                        do {
                            attempts++;
                            this.status = OrderStatus.PAID;
                        } while (attempts < maxAttempts);
                    }
                }
                """;
        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new UmlClassifierVisitor("RetryProcessor.java").visit(cu, evidences);

        CodeEvidenceDTO cls = evidences.stream()
                .filter(e -> "CLASS_INTERFACE".equals(e.getElementType()) && "RetryProcessor".equals(e.getIdentifier()))
                .findFirst()
                .orElseThrow();

        Map<String, Object> uml = (Map<String, Object>) cls.getMetadata().get("umlClassifier");
        List<Map<String, Object>> cfgs = (List<Map<String, Object>>) uml.get("methodsCfg");
        Map<String, Object> cfg = cfgs.get(0);

        List<Map<String, Object>> nodes = (List<Map<String, Object>>) cfg.get("nodes");
        List<Map<String, Object>> edges = (List<Map<String, Object>>) cfg.get("edges");

        Map<String, Object> doHead = nodes.stream()
                .filter(n -> "MERGE".equals(n.get("kind")) && "do-loop-head".equals(n.get("label")))
                .findFirst()
                .orElseThrow();
        Map<String, Object> doDec = nodes.stream()
                .filter(n -> "DECISION".equals(n.get("kind")) && "attempts < maxAttempts".equals(n.get("label")))
                .findFirst()
                .orElseThrow();

        // do-loop-head must come before body and decision must loop back to do-loop-head on [attempts < maxAttempts]
        assertThat(edges.stream().anyMatch(e ->
                doDec.get("id").equals(e.get("from"))
                        && doHead.get("id").equals(e.get("to"))
                        && "[attempts < maxAttempts]".equals(e.get("guard"))
        )).isTrue();

        // OBJECT_NODE and OBJECT_FLOW emitted from AST for OrderStatus.PAID
        Map<String, Object> objNode = nodes.stream()
                .filter(n -> "OBJECT_NODE".equals(n.get("kind")))
                .findFirst()
                .orElseThrow();
        assertThat(objNode.get("label")).isEqualTo("OrderStatus [PAID]");
        assertThat(edges.stream().anyMatch(e ->
                "OBJECT_FLOW".equals(e.get("flowKind")) && objNode.get("id").equals(e.get("to"))
        )).isTrue();
    }

    @Test
    @DisplayName("O4 State Lifecycle: else branch and unguarded assignments do not fabricate transitions from initialState or positive if-guard")
    @SuppressWarnings("unchecked")
    void stateLifecycleDoesNotFabricateFromElseOrUnguardedAssignments() {
        String code = """
                package com.acme.orders;
                public enum OrderStatus { CREATED, VALIDATED, PAID, CANCELLED, ARCHIVED }
                public class OrderStateEngine {
                    private OrderStatus status = OrderStatus.CREATED;

                    public void settleOrCancel() {
                        if (this.status == OrderStatus.VALIDATED) {
                            this.status = OrderStatus.PAID;
                        } else {
                            this.status = OrderStatus.CANCELLED;
                        }
                    }

                    public void forceArchive() {
                        this.status = OrderStatus.ARCHIVED;
                    }
                }
                """;
        CompilationUnit cu = StaticJavaParser.parse(code);
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new UmlClassifierVisitor("OrderStateEngine.java").visit(cu, evidences);

        CodeEvidenceDTO cls = evidences.stream()
                .filter(e -> "CLASS_INTERFACE".equals(e.getElementType()) && "OrderStateEngine".equals(e.getIdentifier()))
                .findFirst()
                .orElseThrow();

        Map<String, Object> uml = (Map<String, Object>) cls.getMetadata().get("umlClassifier");
        Map<String, Object> lifecycle = (Map<String, Object>) uml.get("stateLifecycle");
        assertThat(lifecycle).isNotNull();

        List<Map<String, Object>> transitions = (List<Map<String, Object>>) lifecycle.get("transitions");
        List<String> unresolved = (List<String>) lifecycle.get("unresolvedAssignments");

        // Only VALIDATED -> PAID is a proven single-source transition
        assertThat(transitions).hasSize(1);
        assertThat(transitions.get(0).get("fromState")).isEqualTo("VALIDATED");
        assertThat(transitions.get(0).get("toState")).isEqualTo("PAID");

        // Both CANCELLED (in else branch) and ARCHIVED (unguarded) are recorded as unresolved, NOT fabricated from CREATED or VALIDATED
        assertThat(unresolved).hasSize(2);
        assertThat(unresolved.stream().anyMatch(u -> u.contains("settleOrCancel->CANCELLED"))).isTrue();
        assertThat(unresolved.stream().anyMatch(u -> u.contains("forceArchive->ARCHIVED"))).isTrue();
        assertThat(lifecycle.get("extractionCompleteness")).isEqualTo("PARTIAL");
    }

    @Test
    @SuppressWarnings("unchecked")
    void sourceCallsCarryArgumentArityAndKnownTypesForOverloads() {
        var cu = StaticJavaParser.parse("class Controller { Service service; void create(Request request) { service.accept(\"text\", 7, request); } }");
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new UmlClassifierVisitor("Controller.java").visit(cu, evidences);
        var cls = evidences.stream().filter(e -> "CLASS_INTERFACE".equals(e.getElementType())).findFirst().orElseThrow();
        var uml = (Map<String,Object>) cls.getMetadata().get("umlClassifier");
        var cfgs = (List<Map<String,Object>>) uml.get("methodsCfg");
        var calls = (List<Map<String,Object>>) cfgs.get(0).get("calls");
        assertThat(calls).hasSize(1);
        assertThat(calls.get(0).get("argumentCount")).isEqualTo(3);
        assertThat((List<String>) calls.get(0).get("argumentTypes")).containsExactly("String", "int", "Request");
    }

    @Test
    @SuppressWarnings("unchecked")
    void runtimeDraftMetadataPreservesControllerPrefixAndMethodAccessRules() {
        var cu = StaticJavaParser.parse("@RequestMapping(\"/api\") class Controller { @GetMapping(\"/items\") @Secured(\"ROLE_ADMIN\") public String list() { return \"ok\"; } }");
        List<CodeEvidenceDTO> evidences = new ArrayList<>();
        new UmlClassifierVisitor("Controller.java").visit(cu, evidences);
        var cls = evidences.stream().filter(e -> "CLASS_INTERFACE".equals(e.getElementType())).findFirst().orElseThrow();
        var uml = (Map<String,Object>) cls.getMetadata().get("umlClassifier");
        assertThat((List<String>) uml.get("endpointPrefixDeclarations")).containsExactly("@RequestMapping(\"/api\")");
        var members = (List<Map<String,Object>>) uml.get("members");
        var method = members.stream().filter(m -> "list".equals(m.get("name"))).findFirst().orElseThrow();
        assertThat((List<String>) method.get("accessDeclarations")).containsExactly("@Secured(\"ROLE_ADMIN\")");
    }
}
