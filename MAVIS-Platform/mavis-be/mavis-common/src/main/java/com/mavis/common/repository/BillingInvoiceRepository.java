package com.mavis.common.repository;

import com.mavis.common.entity.BillingInvoice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface BillingInvoiceRepository extends JpaRepository<BillingInvoice, UUID> {
}
