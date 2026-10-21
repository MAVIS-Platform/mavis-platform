package com.mavis.poc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootApplication
@RestController
public class PaymentApplication {
    public static void main(String[] args) { SpringApplication.run(PaymentApplication.class, args); }
    @GetMapping("/health") public String health() { return "ready"; }
    @GetMapping("/pay") public String pay() { return "paid"; }
    @GetMapping("/fail") public ResponseEntity<String> fail() { return ResponseEntity.status(503).body("test failure"); }
}
