package com.mavis.analyzer.javaanalyzer.parser;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class SourceMethodCoverageTest {
 @TempDir Path root;
 @Test void preservesClientsModelsEndpointCallsAndCollectionIteration() throws Exception {
  Path folder=root.resolve("department-service/src/main/java/demo");Files.createDirectories(folder);
  Files.writeString(folder.resolve("DepartmentController.java"), """
   package demo;
   import java.util.List;
   import org.springframework.web.bind.annotation.GetMapping;
   class DepartmentController {
     DepartmentRepository repository; EmployeeClient employeeClient;
     @GetMapping("/organization/{id}/with-employees")
     public List<Department> findWithEmployees(Long id) {
       List<Department> departments = repository.findByOrganization(id);
       departments.forEach(d -> d.setEmployees(employeeClient.findByDepartment(d.getId())));
       return departments;
     }
   }
   """);
  Files.writeString(folder.resolve("EmployeeClient.java"),"package demo; interface EmployeeClient { Object findByDepartment(Long id); }");
  Files.writeString(folder.resolve("DepartmentRepository.java"),"package demo; interface DepartmentRepository { java.util.List<Department> findByOrganization(Long id); }");
  Files.writeString(folder.resolve("Department.java"),"package demo; class Department { Long id; Object employees; }");
  var findings=new JavaSourceParser().parseProject(root.toString());
  assertThat(findings).filteredOn(f->"CLASS_INTERFACE".equals(f.getElementType())).hasSize(4);
  var controller=findings.stream().filter(f->"CLASS_INTERFACE".equals(f.getElementType())&&"DepartmentController".equals(f.getIdentifier())).findFirst().orElseThrow();
  var classifier=(Map<String,Object>)controller.getMetadata().get("umlClassifier");
  var methods=(List<Map<String,Object>>)classifier.get("methodsCfg");var method=methods.get(0);
  assertThat((List<String>)method.get("endpointDeclarations")).anyMatch(value->value.contains("with-employees"));
  var calls=(List<Map<String,Object>>)method.get("calls");
  assertThat(calls).extracting(call->call.get("methodName")).containsExactly("findByOrganization","findByDepartment");
  assertThat((List<String>)calls.get(1).get("loopConditions")).hasSize(1);
  var nodes=(List<Map<String,Object>>)method.get("nodes");
  assertThat(nodes).anyMatch(node->"DECISION".equals(node.get("kind"))&&node.get("label").toString().contains("each"));
  assertThat(method.get("extractionCompleteness")).isEqualTo("COMPLETE");
 }
}
