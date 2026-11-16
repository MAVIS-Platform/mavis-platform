package com.mavis.platform.auth.service.impl;

import com.mavis.platform.auth.service.EmailService;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.MailException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.MimeMessageHelper;
import com.mavis.common.exception.AuthException;
import com.mavis.common.exception.AuthErrorCode;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailServiceImpl implements EmailService {

    private final JavaMailSender javaMailSender;

    @Value("${MAIL_FROM:${spring.mail.username:}}")
    private String fromAddress;

    // Public recovery/resend responses must not vary with account existence or
    // SMTP latency/failure. Delivery remains asynchronous for these requests.
    @Override
    @org.springframework.scheduling.annotation.Async
    public void requestOtpEmail(String toEmail, String otpCode, String purpose) {
        try {
            sendOtpEmail(toEmail, otpCode, purpose);
        } catch (AuthException ignored) {
            // sendOtpEmail already recorded a sanitized diagnostic.
        }
    }

    @Override
    public void sendOtpEmail(String toEmail, String otpCode, String purpose) {
        try {
            MimeMessage message = javaMailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            if (fromAddress == null || fromAddress.isBlank()) throw new MessagingException("SMTP sender is not configured");
            helper.setFrom(fromAddress);
            helper.setTo(toEmail);

            String subject;
            String headerText;
            String bodyText;

            if ("PASSWORD_RESET".equals(purpose)) {
                subject = "Yêu cầu khôi phục mật khẩu MAVIS";
                headerText = "Khôi phục mật khẩu";
                bodyText = "Bạn vừa yêu cầu khôi phục mật khẩu tại hệ thống MAVIS. Vui lòng sử dụng mã OTP dưới đây để thiết lập lại mật khẩu của bạn:";
            } else {
                subject = "Xác thực tài khoản MAVIS";
                headerText = "Xác thực Email";
                bodyText = "Cảm ơn bạn đã đăng ký tài khoản tại hệ thống MAVIS. Để hoàn tất việc đăng ký, vui lòng sử dụng mã OTP dưới đây để xác thực email của bạn:";
            }

            helper.setSubject(subject);

            String htmlContent = """
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                        <h2 style="color: #4CAF50; text-align: center;">MAVIS Platform</h2>
                        <h3 style="color: #333; text-align: center;">%s</h3>
                        <p>Chào bạn,</p>
                        <p>%s</p>
                        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
                            <h1 style="margin: 0; color: #333; letter-spacing: 5px;">%s</h1>
                        </div>
                        <p>Mã OTP này sẽ hết hạn trong vòng <strong>5 phút</strong>.</p>
                        <p>Nếu bạn không thực hiện yêu cầu này, vui lòng đổi mật khẩu tài khoản và bỏ qua email này.</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <p style="font-size: 12px; color: #888; text-align: center;">© 2024 MAVIS Platform. All rights reserved.</p>
                    </div>
                    """.formatted(headerText, bodyText, otpCode);

            helper.setText(htmlContent, true);
            javaMailSender.send(message);

            log.info("Email OTP sent successfully to {} for purpose {}", toEmail, purpose);
        } catch (MessagingException | MailException e) {
            // SMTP exception text may contain provider/account details; never log OTP or credentials.
            log.error("OTP email delivery failed; check SMTP sender, TLS and credentials ({})", e.getClass().getSimpleName());
            throw new AuthException(AuthErrorCode.AUTH_EMAIL_DELIVERY);
        }
    }
}
