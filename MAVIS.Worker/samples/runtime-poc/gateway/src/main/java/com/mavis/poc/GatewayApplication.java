package com.mavis.poc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;

@SpringBootApplication
@RestController
public class GatewayApplication {
    public static void main(String[] args) { SpringApplication.run(GatewayApplication.class, args); }
    @GetMapping("/health") public String health() { return "ready"; }
    @GetMapping("/checkout") public String checkout() {
        return RestClient.create(System.getenv("CATALOG_URL")).get().uri("/catalog").retrieve().body(String.class);
    }
}
