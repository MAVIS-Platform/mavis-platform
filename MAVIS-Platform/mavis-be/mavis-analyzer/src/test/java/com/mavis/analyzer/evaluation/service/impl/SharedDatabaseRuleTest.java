package com.mavis.analyzer.evaluation.service.impl;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mavis.common.entity.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.assertThat;
class SharedDatabaseRuleTest {
 final ObjectMapper mapper=new ObjectMapper();
 ModelElement node(String name,String type){return ModelElement.builder().id(UUID.randomUUID()).name(name).elementType(type).build();}
 ModelElement database(String name,String schema){var db=node(name,"DATABASE");db.setLanguageStack("MYSQL");db.setProperties(mapper.createObjectNode().put("resourceRole","LOGICAL_DATASTORE").put("physicalHost","mysql").put("database",name).put("schema",schema));return db;}
 ModelRelationship edge(ModelElement a,ModelElement b,String type){return ModelRelationship.builder().id(UUID.randomUUID()).sourceElement(a).targetElement(b).relationType(type).originLayer("STATIC").build();}
 @Test void sameHostWithSeparateSchemasIsNotSharedData(){var a=node("a","SERVICE_CONTAINER");var b=node("b","SERVICE_CONTAINER");var x=database("shop","orders");var y=database("shop","payments");var result=SharedDatabaseRule.evaluate(List.of(a,b,x,y),List.of(edge(a,x,"DATABASE_ACCESS"),edge(b,y,"DATABASE_ACCESS")),mapper);assertThat(result).hasSize(2).allMatch(f->f.getStatus().equals("PASS"));}
 @Test void sameLogicalIdentityAcrossNodesGroupsOwners(){var a=node("a","SERVICE_CONTAINER");var b=node("b","SERVICE_CONTAINER");var x=database("shared","");var y=database("shared","");var result=SharedDatabaseRule.evaluate(List.of(a,b,x,y),List.of(edge(a,x,"DATABASE_ACCESS"),edge(b,y,"DATABASE_ACCESS")),mapper);assertThat(result).hasSize(1);assertThat(result.get(0).getStatus()).isEqualTo("VIOLATION");assertThat(result.get(0).getDetails().path("relatedElementIds")).hasSize(4);assertThat(result.get(0).getMessage()).doesNotContain("truy cập đồng thời");}
 @Test void startupAndDeploymentAreNotDataAccess(){var a=node("a","SERVICE_CONTAINER");var db=database("data","");var deployed=edge(a,db,"DATABASE_ACCESS");deployed.setOriginLayer("DEPLOYMENT");var result=SharedDatabaseRule.evaluate(List.of(a,db),List.of(edge(a,db,"DECLARED_COMPOSE"),deployed),mapper);assertThat(result).hasSize(1);assertThat(result.get(0).getStatus()).isEqualTo("NOT_APPLICABLE");}
 @Test void physicalHostAndUnknownOwnersNeedReview(){var a=node("a","SERVICE_CONTAINER");var b=node("b","SERVICE_CONTAINER");var db=node("mysql","DATABASE");var result=SharedDatabaseRule.evaluate(List.of(a,b,db),List.of(edge(a,db,"DATABASE_ACCESS"),edge(b,db,"DATABASE_ACCESS")),mapper);assertThat(result).hasSize(1).allMatch(f->f.getStatus().equals("NEEDS_REVIEW"));var orphan=node("repository","COMPONENT");var logical=database("orders","");assertThat(SharedDatabaseRule.evaluate(List.of(orphan,logical),List.of(edge(orphan,logical,"DATABASE_ACCESS")),mapper).get(0).getStatus()).isEqualTo("NEEDS_REVIEW");}
 @Test void componentsResolveToTheirServiceWithoutDoubleCounting(){var a=node("a","SERVICE_CONTAINER");var b=node("b","SERVICE_CONTAINER");var x=node("repo","COMPONENT");x.setParentElement(a);var db=database("shared","");var result=SharedDatabaseRule.evaluate(List.of(a,b,x,db),List.of(edge(x,db,"DATABASE_ACCESS"),edge(a,db,"DATABASE_ACCESS"),edge(b,db,"DATABASE_ACCESS")),mapper);assertThat(result.get(0).getDetails().path("relatedElementIds")).hasSize(3);}
}
