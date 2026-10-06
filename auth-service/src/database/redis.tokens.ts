export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
// Symbol tạo ra một định danh duy nhất (unique key) không thể trùng lặp trong runtime.
// Giúp phân biệt các dependencies khác nhau, tránh collision.