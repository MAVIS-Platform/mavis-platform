package com.mavis.platform.auth.service.impl;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import jakarta.mail.Multipart;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.Properties;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EmailServiceTest {
    @Test void smtpMessageHasExplicitSenderRecipientAndOtp()throws Exception{
        var sender=mock(JavaMailSender.class);var message=new MimeMessage(Session.getInstance(new Properties()));when(sender.createMimeMessage()).thenReturn(message);
        var service=new EmailServiceImpl(sender);ReflectionTestUtils.setField(service,"fromAddress","mavis-local@example.invalid");service.sendOtpEmail("student@example.invalid","123456","EMAIL_VERIFICATION");
        verify(sender).send(message);assertEquals("mavis-local@example.invalid",message.getFrom()[0].toString());assertEquals("student@example.invalid",message.getAllRecipients()[0].toString());assertEquals("Xác thực tài khoản MAVIS",message.getSubject());
        var mixed=(Multipart)message.getContent();var related=(Multipart)mixed.getBodyPart(0).getContent();assertTrue(related.getBodyPart(0).getContent().toString().contains("123456"));
    }
    @Test void checkedSmtpFailureHasSafeCodeAndPublicRecoveryStaysNeutral(){var sender=mock(JavaMailSender.class);when(sender.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));doThrow(new MailSendException("provider sentinel")).when(sender).send(any(MimeMessage.class));var service=new EmailServiceImpl(sender);ReflectionTestUtils.setField(service,"fromAddress","mavis-local@example.invalid");var failure=assertThrows(com.mavis.common.exception.AuthException.class,()->service.sendOtpEmail("student@example.invalid","123456","EMAIL_VERIFICATION"));assertEquals(com.mavis.common.exception.AuthErrorCode.AUTH_EMAIL_DELIVERY,failure.getAuthErrorCode());assertFalse(failure.getMessage().contains("sentinel"));assertDoesNotThrow(()->service.requestOtpEmail("student@example.invalid","123456","PASSWORD_RESET"));verify(sender,times(2)).send(any(MimeMessage.class));}
}
