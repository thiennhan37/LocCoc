package com.loccoc.payment.repository;

import com.loccoc.payment.model.entity.PaymentTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, Long> {
    Optional<PaymentTransaction> findByOrderCode(Long orderCode);
    List<PaymentTransaction> findByUserId(Long userId);
}
