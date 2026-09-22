package vn.edu.fpt.mavisbootstrap;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication(scanBasePackages = {"com.mavis"}) // Quét toàn bộ Component/Service ở tất cả các module
@EntityScan(basePackages = {"com.mavis.common.entity"}) // Chỉ chỗ tìm Entity
@EnableJpaRepositories(basePackages = {"com.mavis.common.repository"}) // Chỉ chỗ tìm Repository
public class MavisBootstrapApplication {

    public static void main(String[] args) {
        SpringApplication.run(MavisBootstrapApplication.class, args);
    }
}