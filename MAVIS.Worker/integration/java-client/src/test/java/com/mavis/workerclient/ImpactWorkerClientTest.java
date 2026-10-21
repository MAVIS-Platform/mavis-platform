package com.mavis.workerclient;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class ImpactWorkerClientTest {
    private ImpactWorkerClient.Request request(){return new ImpactWorkerClient.Request("m","m","g",true,"T",List.of("A","B","T"),List.of(new ImpactWorkerClient.Edge("ab","A","B","HttpRestCall",List.of("ev1")),new ImpactWorkerClient.Edge("bt","B","T","HttpRestCall",List.of("ev2"))),10,List.of(),1000);}
    @Test void validPathProofIsAcceptedWithoutRunningAnotherTraversal(){
        var path=new ImpactWorkerClient.Path("A","Indirect",2,List.of("A","B","T"),List.of("ab","bt"),List.of("ev1","ev2"));
        assertDoesNotThrow(()->ImpactWorkerClient.validate(request(),new ImpactWorkerClient.Result("m","g","T",List.of(path),false,List.of(),List.of())));
    }
    @Test void wrongRevisionAndForeignEvidenceAreRejected(){
        var path=new ImpactWorkerClient.Path("A","Indirect",2,List.of("A","B","T"),List.of("ab","bt"),List.of("foreign"));
        assertThrows(IllegalArgumentException.class,()->ImpactWorkerClient.validate(request(),new ImpactWorkerClient.Result("m","g","T",List.of(path),false,List.of(),List.of())));
        assertThrows(IllegalArgumentException.class,()->ImpactWorkerClient.validate(request(),new ImpactWorkerClient.Result("m","other","T",List.of(),false,List.of(),List.of())));
    }
}
