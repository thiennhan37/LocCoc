package com.loccoc.payment;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.io.File;
import java.nio.file.Files;
import java.util.List;

@SpringBootApplication
public class PaymentServiceApplication {
    public static void main(String[] args) {
        loadDotEnv();
        SpringApplication.run(PaymentServiceApplication.class, args);
    }

    private static void loadDotEnv() {
        File[] possibleFiles = { new File("../.env"), new File(".env"), new File("../../.env") };
        for (File file : possibleFiles) {
            if (file.exists()) {
                try {
                    List<String> lines = Files.readAllLines(file.toPath());
                    for (String line : lines) {
                        String trimmed = line.trim();
                        if (!trimmed.isEmpty() && !trimmed.startsWith("#") && trimmed.contains("=")) {
                            int eqIdx = trimmed.indexOf('=');
                            String key = trimmed.substring(0, eqIdx).trim();
                            String value = trimmed.substring(eqIdx + 1).trim();
                            if (value.startsWith("\"") && value.endsWith("\"") && value.length() >= 2) {
                                value = value.substring(1, value.length() - 1);
                            }
                            System.setProperty(key, value);
                        }
                    }
                    System.out.println(">>> Successfully loaded .env from: " + file.getCanonicalPath());
                    break;
                } catch (Exception ignored) {}
            }
        }
    }
}
