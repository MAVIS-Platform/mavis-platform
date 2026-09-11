package vn.edu.fpt.mavisbootstrap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
// Lệnh scanBasePackages ép Spring tìm kiếm các class ở toàn bộ các module khác
@SpringBootApplication(scanBasePackages = {"com.mavis"})
public class MavisBootstrapApplication {

    public static void main(String[] args) {
        SpringApplication.run(MavisBootstrapApplication.class, args);
    }

}
