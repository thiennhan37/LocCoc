# Technical Specification: PayOS Checkout & Webhook Handling

## 1. Overview
Đặc tả kỹ thuật luồng khởi tạo thanh toán qua VietQR và xử lý Webhook từ PayOS trong module `payment-service` của hệ thống LocCoc.

## 2. Architecture & Data Flow

```mermaid
sequenceDiagram
    autonumber
    actor User as Client / Flutter App
    participant GW as API Gateway (:3000)
    participant PS as Payment Service (:8085)
    participant DB as MySQL (payment_db)
    participant Redis as Redis (:6379)
    participant PayOS as PayOS API / Gateway
    participant Kafka as Kafka (payment.events)

    User->>GW: POST /payments/checkout {userId, tierCode, billingCycle}
    GW->>PS: Proxy POST /payments/checkout
    PS->>DB: Check & validate Tier
    PS->>PayOS: Create Payment Link (v2 CreatePaymentLinkRequest)
    PayOS-->>PS: Return checkoutUrl & qrCode
    PS->>DB: Save PaymentTransaction (status=PENDING)
    PS-->>GW: Return ApiResponse<CheckoutResponse>
    GW-->>User: Return QR Code / Checkout URL

    Note over User,PayOS: User scans VietQR & transfers money
    PayOS->>GW: POST /payments/webhook/payos (with HMAC signature)
    GW->>PS: Proxy POST /payments/webhook/payos
    PS->>PS: Verify HMAC SHA256 signature
    PS->>Redis: Acquire lock:order:<orderCode>
    PS->>DB: Find transaction & check Idempotency
    alt Transaction is PENDING
        PS->>DB: Update status = PAID
        PS->>DB: Activate / Extend User Subscription
        PS->>Kafka: Publish PAYMENT_SUCCESS & SUBSCRIPTION_UPGRADED
    end
    PS->>Redis: Release lock
    PS-->>GW: HTTP 200 { success: true, message: "Webhook processed" }
    GW-->>PayOS: HTTP 200 OK
```

## 3. Endpoints

### 3.1. Khởi tạo thanh toán
- **URL**: `POST /payments/checkout`
- **Request Body**:
  ```json
  {
    "userId": "usr_test123",
    "tierCode": "PRO",
    "billingCycle": "MONTHLY",
    "returnUrl": "http://localhost:3000/payment-success",
    "cancelUrl": "http://localhost:3000/payment-cancel"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Checkout initiated successfully",
    "data": {
      "orderCode": 1740000000000,
      "checkoutUrl": "https://pay.payos.vn/web/...",
      "qrCode": "vietqr://...",
      "amount": 99000,
      "status": "PENDING"
    }
  }
  ```

### 3.2. Webhook Callback
- **URL**: `POST /payments/webhook/payos`
- **Headers**: PayOS Standard Headers
- **Payload**: Standard PayOS Webhook Data (`code`, `desc`, `data: { orderCode, amount, reference, transactionDateTime, ... }`, `signature`).
- **Response**: Luôn trả về `HTTP 200 OK` (`{"success": true, "message": "Webhook processed"}`).

## 4. Security & Error Handling
- **Signature Verification**: Bắt buộc mọi webhook body đều phải được xác thực bằng `payOS.webhooks().verify(body)` sử dụng `PAYOS_CHECKSUM_KEY`.
- **Idempotency**: Dùng Redis Key `lock:order:{orderCode}` với TTL 10 giây để chống duplicate execution.
- **PayOS Verification Ping**: Khi đăng ký webhook, PayOS gửi 1 request test, controller nhận diện và trả về HTTP 200 ngay lập tức.
