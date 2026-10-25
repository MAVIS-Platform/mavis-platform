package com.mavis.analyzer.javaanalyzer.parser;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class BeanMessagingParserTest {
    @TempDir Path root;
    private void source(String path,String code)throws Exception {var file=root.resolve(path);Files.createDirectories(file.getParent());Files.writeString(file,code);}
    @Test void resolvesCrossModuleChannelConstantsAndLocalBeanFactories() throws Exception {
        source("contracts/Channels.java","package demo.api; public interface Channels { String COMMAND_CHANNEL = \"kitchen.commands\"; }");
        source("orders/Proxy.java","""
                package demo.orders;
                import demo.api.*;
                import io.eventuate.tram.sagas.simpledsl.CommandEndpointBuilder;
                public class Proxy {
                  Object create = CommandEndpointBuilder.forCommand(String.class).withChannel(Channels.COMMAND_CHANNEL).build();
                }
                """);
        source("orders/Configuration.java","package demo.orders; import org.springframework.context.annotation.Bean; class Configuration { @Bean Proxy proxy(){ return new Proxy(); } }");
        source("kitchen/Handler.java","""
                package demo.kitchen;
                import demo.api.Channels;
                import io.eventuate.tram.sagas.participant.SagaCommandHandlersBuilder;
                class Handler { Object commands(){return SagaCommandHandlersBuilder.fromChannel(Channels.COMMAND_CHANNEL).build();} }
                """);
        var facts=new JavaSourceParser().parseProject(root.toString());
        assertThat(facts).filteredOn(e->"MESSAGE_PUBLISH".equals(e.getElementType())).singleElement().satisfies(e->{assertThat(e.getIdentifier()).isEqualTo("kitchen.commands");assertThat(e.getFilePath()).contains("orders");});
        assertThat(facts).filteredOn(e->"MESSAGE_SUBSCRIBE".equals(e.getElementType())).singleElement().satisfies(e->assertThat(e.getIdentifier()).isEqualTo("kitchen.commands"));
        assertThat(facts).filteredOn(e->"GENERAL_COMPONENT".equals(e.getElementType())).singleElement().satisfies(e->assertThat(e.getQualifiedName()).isEqualTo("demo.orders.Proxy"));
    }
    @Test void unresolvedChannelsAreFindingsAndArbitrarySendMethodsAreNotKafka() throws Exception {
        source("Unknown.java","""
                package demo;
                import io.eventuate.tram.sagas.simpledsl.CommandEndpointBuilder;
                class Unknown { Object endpoint=CommandEndpointBuilder.forCommand(String.class).withChannel(settings.channel()).build(); void unrelated(){ email.send("not-a-topic"); } }
                """);
        var facts=new JavaSourceParser().parseProject(root.toString());
        assertThat(facts).filteredOn(e->"UNRESOLVED_MESSAGE_CHANNEL".equals(e.getElementType())).hasSize(1);
        assertThat(facts).noneMatch(e->"MESSAGE_PUBLISH".equals(e.getElementType()));
    }
    @Test void selectedFtgoSourceHasBothCommandEndpointsAndHandlers() {
        String path=System.getProperty("mavis.test.ftgoSource");Assumptions.assumeTrue(path!=null);
        var facts=new JavaSourceParser().parseProject(path);
        assertThat(facts).anyMatch(e->"MESSAGE_PUBLISH".equals(e.getElementType())&&e.getFilePath().contains("KitchenServiceProxy"));
        assertThat(facts).anyMatch(e->"MESSAGE_SUBSCRIBE".equals(e.getElementType())&&e.getFilePath().contains("KitchenServiceCommandHandler"));
        System.out.println("MAVIS FTGO source facts: "+facts.stream().collect(java.util.stream.Collectors.groupingBy(e->e.getElementType(),java.util.stream.Collectors.counting())));
    }
}